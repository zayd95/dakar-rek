// The « Au volant » view of a GLB body with the shared cockpit (src/actors/cockpit.ts), desktop and phone-portrait, at the kit's driver anchor,
// with the steering centred and turned. Usage: node scripts/vehicles/shoot-cockpit.mjs [baseUrl] [outDir=docs/vehicles/pilot/cockpit] [id=compacte] [kind=sedan] [seed=14]
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const [,, base = 'http://127.0.0.1:4310/', out = 'docs/vehicles/pilot/cockpit', id = 'compacte', kind = 'sedan', seed = '14'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, vp, touch, fov] of [['desktop', { width: 1000, height: 560 }, false, 70], ['phone', { width: 390, height: 844 }, true, 70]]) {
  const ctx = await browser.newContext({ viewport: vp, ...(touch ? { hasTouch: true, isMobile: true } : {}) }), page = await ctx.newPage(); page.setDefaultTimeout(180000);
  await page.goto(`${base}?debug&vehicleModel=glb${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos?.().hub);
  await page.evaluate(() => { const D = window.__dakar; D.setHour(11); document.body.querySelectorAll(':scope > *:not(canvas):not(script)').forEach(e => { e.style.visibility = 'hidden'; }); });
  await page.evaluate(async ([id, kind, seed]) => {
    const D = window.__dakar; D.kitShowroom({ vehicles: [], x: 4000, z: 0 });
    const g = await D.kitGlb(id, kind, Number(seed)); g.position.set(4000, 0.02, 0); D.three.scene.getObjectByName('kit_showroom').add(g);
    window.__ck = g;
  }, [id, kind, seed]);
  for (const steer of [0, 0.5]) {
    await page.evaluate(([steer, fov]) => {
      const D = window.__dakar, g = window.__ck, spec = g.userData.vehicleSpec, e = spec.cameras.driver;
      g.userData.glbCockpit.visible = true; D.animateVehicle(g, 0, steer, 0.016);
      const cam = D.three.camera; cam.fov = fov; cam.updateProjectionMatrix();
      D.cam([4000 + e.pos[0], e.pos[1], e.pos[2]], [4000 + e.look[0], e.look[1], e.look[2]]); D.render();
    }, [steer, fov]);
    await page.waitForTimeout(300);
    await sharp(await page.screenshot()).jpeg({ quality: 80 }).toFile(`${out}/${label}-steer${steer}.jpg`);
  }
  await ctx.close();
}
await browser.close();
console.log('written', out);
