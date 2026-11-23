// Integration check against a running build: node scripts/check-vehicle-assets.mjs http://localhost:4173/
// Uses a tiny synthetic GLTF fixture, not a production car model or visual-quality claim.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173/';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4LyIiIvKfQUTk/38REQAgUgSd9OqP5wAAAABJRU5ErkJggg==', 'base64');
const vertices = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 2, 0]);
const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
const bytes = Buffer.concat([Buffer.from(vertices.buffer), Buffer.from(uvs.buffer)]);
const fixture = {
  asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString('base64')}`, byteLength: bytes.length }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertices.byteLength }, { buffer: 0, byteOffset: vertices.byteLength, byteLength: uvs.byteLength }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' }],
  images: [{ uri: 'vehicle-test.png' }], textures: [{ source: 0 }],
  materials: [
    { pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: 0.35, metallicFactor: 0.6 } },
    { alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.4] } },
  ],
  meshes: [{ name: 'VehicleAssetFixture', primitives: [0, 1].map(material => ({ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material })) }],
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const useFixture of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      let textureRequests = 0;
      await page.route('**/assets/car_rapide.glb', route => route.fulfill(useFixture
        ? { contentType: 'model/gltf+json', body: JSON.stringify(fixture) }
        : { status: 404, body: '' }));
      await page.route('**/assets/vehicle-test.png', route => { textureRequests++; return route.fulfill({ contentType: 'image/png', body: png }); });
      await page.goto(`${base}?debug&touch`);
      await page.waitForFunction(() => window.__dakar?.pos().hub && window.__dakar.wrestlerReady());
      for (const hub of ['pikine', 'plateau', 'corniche', 'almadies']) {
        const result = await page.evaluate(([hub, useFixture]) => {
          const d = window.__dakar;
          d.teleport(hub);
          const root = d.three.scene.getObjectByName(useFixture ? 'car_rapide_blender' : 'kit_car_rapide');
          // The apprentice is attached too; check only the imported fixture's meshes.
          const meshes = []; root?.traverse(o => { if (o.isMesh && o.name.startsWith('VehicleAssetFixture')) meshes.push(o); });
          if (!useFixture) {
            // Vehicle kit: every kit vehicle (station and traffic) is ≤ 3 meshes on 3 shared materials, with a spec.
            const kits = []; d.three.scene.traverse(o => { if (/^kit_/.test(o.name) && o.userData.vehicleSpec) kits.push(o); });
            const mats = new Set(); let worst = 0, unshared = 0, clones = 0;   // animation clones (animateVehicle) share program and textures
            for (const k of kits) {
              const lod = k.children.find(c => c.isLOD);
              const near = []; (lod ? lod.levels[0].object : k).traverse(m => { if (m.isMesh) near.push(m); });
              worst = Math.max(worst, near.length);
              k.traverse(m => { if (m.isMesh && m.name !== 'apprenti') { if (!m.material.userData.kitAnimClone) mats.add(m.material); else clones++; if (!m.userData.shared && m.geometry?.attributes?.color) unshared++; } });
            }
            const spec = root?.userData.vehicleSpec;
            return { hub: d.pos().hub, found: !!root, kits: kits.length, worst, kitMaterials: [...mats].filter(m => m.vertexColors).length, unshared,
              step: !!spec?.step, seats: spec?.seats.length ?? 0, doors: spec?.doors.map(x => x.id) ?? [] };
          }
          const materials = meshes.flatMap(m => Array.isArray(m.material) ? m.material : [m.material]);
          const paint = materials.find(m => m.map);
          const glass = materials.find(m => m.transparent);
          // Listen to real hub cleanup on the next teleport, not a copied cleanup algorithm.
          window.__vehicleDisposals ??= 0;
          for (const m of meshes) {
            m.geometry.addEventListener('dispose', () => window.__vehicleDisposals++);
            for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.addEventListener('dispose', () => window.__vehicleDisposals++);
          }
          return { hub: d.pos().hub, found: !!root, textured: !!paint?.isMeshStandardMaterial && !!paint?.map.image,
            roughness: paint?.roughness, metalness: paint?.metalness, opacity: glass?.opacity,
            shared: meshes.every(m => m.userData.shared), disposals: window.__vehicleDisposals };
        }, [hub, useFixture]);
        assert.equal(result.hub, hub); assert.equal(result.found, true);
        if (!useFixture) {
          assert.ok(result.kits >= 3, `kit vehicles in ${hub}: ${result.kits}`);
          assert.ok(result.worst <= 3, `near model meshes ≤ 3, got ${result.worst}`);
          assert.ok(result.kitMaterials <= 2, `kit body + glass materials shared, got ${result.kitMaterials}`);
          assert.equal(result.unshared, 0);
          assert.equal(result.step, true); assert.ok(result.seats >= 12); assert.ok(result.doors.includes('rear'));
        }
        if (useFixture) {
          assert.equal(result.textured, true); assert.equal(result.roughness, 0.35); assert.equal(result.metalness, 0.6);
          assert.equal(result.opacity, 0.4); assert.equal(result.shared, true); assert.equal(result.disposals, 0);
        }
      }
      assert.deepEqual(errors, []);
      assert.equal(textureRequests, useFixture ? 1 : 0);
      console.log(`PASS: four hubs, ${useFixture ? 'textured PBR asset and shared-resource cleanup' : 'missing-asset fallback to the vehicle kit (≤ 3 meshes per vehicle, shared materials, car rapide spec)'}, no page errors`);
    } finally { await ctx.close(); }
  }
} finally { await browser.close(); }
