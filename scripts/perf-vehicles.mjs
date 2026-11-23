// Vehicle rendering cost in a busy street, comparable between builds (headless Chromium + SwiftShader).
// Usage: node scripts/perf-vehicles.mjs <baseUrl> <label> [out.json]
//
// Scenario (identical in every build): Plateau and Pikine at 10:00 and 21:00, the player on the sidewalk of the
// north-south avenue at x = 0, game camera behind them. The random decorative traffic is hidden; a fixed "rush hour"
// of 12 vehicles (4 car rapides + 8 cars, both lanes, 8 m apart from 10 m to 66 m ahead) is placed on the avenue.
// The kit build makes them with __dakar.kitVehicle(kind, seed); an older build clones its own taxi and car rapide.
// Reported: draw calls and triangles of the whole frame with and without the 12 vehicles (averaged over frames),
// and the static cost of each vehicle model. SwiftShader numbers compare builds; they are not phone measurements.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [,, base = 'http://localhost:4215/', label = 'build', out] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const T = { timeout: 120000 };
const result = { label, date: new Date().toISOString(), rows: [], models: null };
const ANDROID = 'Mozilla/5.0 (Linux; Android 12; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

for (const [vp, w, h, quality] of [['desktop', 1280, 720, 'high'], ['phone', 390, 844, 'medium'], ['phone-low', 390, 844, 'low']]) {
  const touch = w < h;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, ...(touch ? { userAgent: ANDROID } : {}) });
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  await page.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, T);
  await page.waitForFunction(() => window.__dakar?.pos().hub && window.__dakar.drawCalls() > 0, null, T);

  for (const hub of ['plateau', 'pikine']) {
    await page.evaluate(hb => { window.__dakar.teleport(hb); window.__dakar.setHour(10); window.__dakar.place(5.8, -30, 0); }, hub);
    await page.waitForTimeout(1200);
    // Build the rush hour and hide the random traffic.
    const info = await page.evaluate(() => {
      const d = window.__dakar, scene = d.three.scene;
      const isVehicle = o => /TEMP_taxi|car_rapide|^kit_/.test(o.name);
      const found = []; scene.traverse(o => { if (isVehicle(o)) found.push(o); });
      for (const o of found) if (o.parent && o.parent.children.every(isVehicle)) o.parent.visible = false;   // decorative traffic group
      const Group = scene.children.find(c => c.type === 'Group').constructor;
      const group = new Group(); group.name = 'perf_rush_hour';
      scene.add(group);
      const kinds = ['carRapide', 'taxi', 'sedan', 'carRapide', 'moto', 'taxi', 'suv', 'carRapide', 'sedan', 'taxi', 'carRapide', 'pickup'];
      const oldTaxi = found.find(o => o.name === 'TEMP_taxi'), oldRapide = found.find(o => /car_rapide/.test(o.name));
      kinds.forEach((k, i) => {
        let v;
        if (d.kitVehicle) v = d.kitVehicle(k, i * 7 + 3);
        else { v = (k === 'carRapide' ? oldRapide : oldTaxi)?.clone(true); if (v) v.children = v.children.filter(x => x.isMesh); }   // no apprentice
        if (!v) return;
        const lane = i % 2 ? 2.5 : -2.5;            // right-hand traffic: heading +z on the x < 0 side
        v.position.set(lane, 0.08, -20 + i * 8); v.rotation.y = lane < 0 ? 0 : Math.PI;
        group.add(v);
      });
      window.__rush = group;
      return { kit: !!d.kitVehicle, count: group.children.length };
    });
    for (const hour of [10, 21]) {
      await page.evaluate(hr => window.__dakar.setHour(hr), hour);
      await page.waitForTimeout(600);
      const sample = async visible => page.evaluate(async vis => {
        window.__rush.visible = vis;
        const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await frames();
        let dc = 0, tris = 0; const N = 6;
        for (let k = 0; k < N; k++) { await frames(); dc += window.__dakar.drawCalls(); tris += window.__dakar.tris(); }
        return { dc: Math.round(dc / N), tris: Math.round(tris / N) };
      }, visible);
      const withV = await sample(true), without = await sample(false);
      const row = { vp, quality, hub, hour, kit: info.kit, vehicles: info.count, drawCalls: withV.dc, tris: withV.tris, drawCallsNoVehicles: without.dc, trisNoVehicles: without.tris, vehicleDrawCalls: withV.dc - without.dc, vehicleTris: withV.tris - without.tris };
      result.rows.push(row); console.log(JSON.stringify(row));
      if (process.env.SHOTS) { await page.evaluate(() => { window.__rush.visible = true; }); await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.SHOTS}/${label}-${vp}-${hub}-${hour}.jpg`, quality: 70 }); }
    }
    await page.evaluate(() => { window.__rush.removeFromParent(); window.__rush = null; });
  }
  if (!result.models) {
    result.models = await page.evaluate(() => {
      const d = window.__dakar, rows = [];
      const cost = (o, name) => {
        let meshes = 0, tris = 0, mats = new Set();
        o.traverse(m => { if (m.isMesh) { meshes++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x.uuid)); } });
        rows.push({ name, meshes, materials: mats.size, tris: Math.round(tris) });
      };
      if (d.kitVehicle) {
        for (const k of d.kitKinds()) {
          const v = d.kitVehicle(k, 1);
          const lod = v.getObjectByProperty('isLOD', true);
          if (lod) { cost(lod.levels[0].object, `${k} near`); cost(lod.levels[1].object, `${k} far`); } else cost(v, k);
        }
      } else {
        const seen = new Set();
        d.three.scene.traverse(o => { if (/TEMP_taxi|TEMP_car_rapide/.test(o.name) && !seen.has(o.name)) { seen.add(o.name); const c = o.clone(true); c.children = c.children.filter(x => !x.isObject3D || x.isMesh); cost(c, o.name); } });
      }
      return rows;
    });
    console.log(JSON.stringify(result.models));
  }
  await ctx.close();
}
await browser.close();
if (out) { fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 1)); }
