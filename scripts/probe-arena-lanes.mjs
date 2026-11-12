// The arena's streets, probed with the drive's own collision test (Pikine): every lane and kerb line of the four streets round the arena block and of the
// junctions at its corners, both ways, and the turns round each corner, for the player's car (Teranga) and the Jakarta. Each sample is the footprint test of
// src/transport/drive.ts `hits` (circles of the half width along the vehicle's axis) through the vehicle module's debug `solidAt` (colliders, raised ground,
// other systems' footprints: the car rapides, the gate's pedestrian zone, the gala jam…), so what blocks here blocks a driver. Every blocked sample is logged with
// what blocked it (collider index and box, footprint and its owner when known); the samples inside the gate's pedestrian zone (gatePlaza) are the zone's own
// and expected (a car stops at its bollards, a Jakarta rides between them). Optionally renders the colliders and footprints of the area as debug boxes.
//
// Usage: node scripts/probe-arena-lanes.mjs <baseUrl> <outDir> [quality=medium] [hours=11,20]   (SWEEP=0: the debug views only)
// Headless Chromium + SwiftShader: a software renderer, NOT a phone.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:4641/', out = '/tmp/claude-0/beta/world/arena-probe', quality = 'medium', hoursArg = '11,20'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const hours = hoursArg.split(',').map(Number);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
await page.goto(`${base}?debug&touch&heure=${hours[0]}&argent=100000000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub === 'pikine' && window.__dakar.teranga?.info().floor.length > 0, null, { timeout: 240000 });
await d(() => { window.__dakar.teranga.own(); window.__dakar.moto.own(); });
await page.waitForFunction(() => ['teranga', 'moto'].every(k => window.__dakar[k].info().owned && window.__dakar[k].info().here), null, { timeout: 120000 });

// the vehicles' footprints (src/actors/vehicleKit.ts: the Teranga 3.94 × 1.745 m; src/transport/moto.ts: the Jakarta's 0.42 m half width, 1.95 m long)
const VEH = { teranga: { hw: 1.745 / 2, hl: 3.94 / 2 }, moto: { hw: 0.42, hl: 1.95 / 2 } };
const LAT = { teranga: [-3.2, -2.1, -1.0, 0, 1.0, 2.1, 3.2], moto: [-4.6, -4.3, -3.2, -2.1, -0.6, 0.6, 2.1, 3.2, 4.3, 4.6] };

const summary = [];
/** The debug views: the arena's north-west corner (0, 0), its west street by the « Arène » stop, the gate's street. */
const VIEWS = [{ name: 'nw-corner', x: 0, z: 0, r: 16 }, { name: 'west-street', x: -2, z: -38, r: 14 }, { name: 'gate-street', x: 30, z: -60, r: 18 }];
for (const hour of hours) {
  await d(h => window.__dakar.setHour(h), hour);
  // the player stands mid-block so every system near the arena is live (the gala jam is solid within 60 m of the player: it is probed from where it stands)
  await d(() => window.__dakar.place(30, -60, 0));
  await page.waitForTimeout(4000);
  const res = process.env.SWEEP === '0' ? { arena: null, plaza: null, event: null, tested: 0, blocked: [], rapides: [] } : await d(({ VEH, LAT }) => {
    const D = window.__dakar, out = { arena: null, plaza: null, blocked: [], tested: 0 };
    const ao = D.arenaOut(); out.arena = ao.gate; out.plaza = D.arenaPlaza()?.rects ?? null; out.event = ao.event;
    const rects = out.plaza ?? [];
    const inPlaza = (x, z, m = 0) => rects.some(r => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);
    const G = D.cityGeometry();
    // the streets: centre lines round the arena block (2,1) = x 7…53, z −53…−7, from junction to junction and past them
    const streets = [
      { id: 'x=0', ax: 0, az: -126, bx: 0, bz: 12 }, { id: 'x=60', ax: 60, az: -126, bx: 60, bz: 12 },
      { id: 'z=-60', ax: -14, az: -60, bx: 74, bz: -60 }, { id: 'z=0', ax: -14, az: 0, bx: 74, bz: 0 }, { id: 'z=-120', ax: -14, az: -120, bx: 74, bz: -120 },
    ];
    const hitsWhy = (key, x, z, yaw) => {
      const { hw, hl } = VEH[key], fx = Math.sin(yaw), fz = Math.cos(yaw), l = Math.max(0, hl - hw), n = Math.max(1, Math.ceil(l / (hw * 0.75)));
      const pts = [[x, z]]; for (let i = 1; i <= n; i++) { const t = (l * i) / n; pts.push([x + fx * t, z + fz * t], [x - fx * t, z - fz * t]); }
      for (const [px, pz] of pts) { const w = D[key].solidAt(px, pz, hw); if (w) return { ...w, at: [+px.toFixed(2), +pz.toFixed(2)] }; }
      return null;
    };
    const log = (key, where, x, z, yaw, w) => {
      const plaza = inPlaza(x, z, VEH[key].hl);
      out.blocked.push({ key, where, x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(2), why: w.why, at: w.at, rect: w.rect ? [w.rect.x0, w.rect.z0, w.rect.x1, w.rect.z1, w.rect.h].map(v => +(+v).toFixed(2)) : null,
        foot: w.foot ? { x: +w.foot.x.toFixed(2), z: +w.foot.z.toFixed(2), yaw: +w.foot.yaw.toFixed(2), hl: +w.foot.hl.toFixed(2), hw: +w.foot.hw.toFixed(2) } : null, plaza });
    };
    for (const key of ['teranga', 'moto']) {
      // straight along every street, at every lateral offset, both ways
      for (const s of streets) {
        const dx = s.bx - s.ax, dz = s.bz - s.az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
        for (const dir of [1, -1]) for (const lat of LAT[key]) {
          const yaw = Math.atan2(ux * dir, uz * dir), lx = -uz * dir, lz = ux * dir;          // lat > 0: to the driver's right
          for (let t = 0; t <= L; t += 0.5) {
            const x = s.ax + ux * t + lx * lat, z = s.az + uz * t + lz * lat; out.tested++;
            const w = hitsWhy(key, x, z, yaw); if (w) log(key, `${s.id} ${dir > 0 ? '→' : '←'} lat ${lat}`, x, z, yaw, w);
          }
        }
      }
      // the turns round each corner of the block: from every approach lane into every other street (right and left turns), a quadratic curve through the lanes' crossing
      for (const J of [[0, -60], [60, -60], [0, 0], [60, 0], [0, -120], [60, -120]]) {
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const a of dirs) for (const b of dirs) {
          if (a[0] === b[0] && a[1] === b[1]) continue; if (a[0] === -b[0] && a[1] === -b[1]) continue;
          const laneOf = (u, k) => ({ x: -u[1] * k, z: u[0] * k });                        // right-hand traffic: the lane is k m to the right of the heading
          const off = key === 'moto' ? [2.1, 3.6] : [2.1];
          for (const k of off) {
            const la = laneOf(a, k), lb = laneOf(b, k);
            const P0 = { x: J[0] - a[0] * 12 + la.x, z: J[1] - a[1] * 12 + la.z }, P2 = { x: J[0] + b[0] * 12 + lb.x, z: J[1] + b[1] * 12 + lb.z };
            // the control point: where the in-lane and the out-lane cross
            const C = { x: a[0] !== 0 ? J[0] + lb.x : J[0] + la.x, z: a[1] !== 0 ? J[1] + lb.z : J[1] + la.z };
            for (let i = 0; i <= 40; i++) {
              const t = i / 40, u = 1 - t, x = u * u * P0.x + 2 * u * t * C.x + t * t * P2.x, z = u * u * P0.z + 2 * u * t * C.z + t * t * P2.z;
              const tx = 2 * u * (C.x - P0.x) + 2 * t * (P2.x - C.x), tz = 2 * u * (C.z - P0.z) + 2 * t * (P2.z - C.z), yaw = Math.atan2(tx, tz); out.tested++;
              const w = hitsWhy(key, x, z, yaw); if (w) log(key, `turn at (${J}) ${a}→${b} lane ${k}`, x, z, yaw, w);
            }
          }
        }
      }
    }
    // what the footprints are: the car rapides now, the zone, the jam (src/city/galaTraffic.ts: arenaOut and gala debug)
    out.rapides = (D.transport?.lines?.() ?? []).flatMap(l => l.vehicles.map(c => ({ line: l.id, x: +c.x.toFixed(1), z: +c.z.toFixed(1) })));
    out.colliderCount = G.colliders.length;
    return out;
  }, { VEH, LAT });
  // group the blocked samples by what blocked them
  const groups = new Map();
  for (const b of res.blocked) {
    const id = b.rect ? `${b.why} [${b.rect.join(', ')}]` : b.foot ? `footprint (${b.foot.x}, ${b.foot.z}) hl ${b.foot.hl} hw ${b.foot.hw}` : b.why;
    const g = groups.get(id) ?? { id, n: 0, keys: new Set(), wheres: new Set(), plaza: 0, sample: b };
    g.n++; g.keys.add(b.key); g.wheres.add(b.where); if (b.plaza) g.plaza++; groups.set(id, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.n - a.n).map(g => ({ id: g.id, samples: g.n, vehicles: [...g.keys], inPlaza: g.plaza, wheres: [...g.wheres].slice(0, 12), example: { x: g.sample.x, z: g.sample.z, yaw: g.sample.yaw, at: g.sample.at } }));
  fs.writeFileSync(`${out}/probe-h${hour}-${quality}.json`, JSON.stringify({ hour, quality, arena: res.arena, plaza: res.plaza, event: res.event, tested: res.tested, blocked: res.blocked.length, groups: rows, rapides: res.rapides, samples: res.blocked }, null, 1));
  console.log(`\n=== hour ${hour} (${quality}) · ${res.tested} samples, ${res.blocked.length} blocked · event ${res.event} · gate ${JSON.stringify(res.arena && { x: res.arena.x, z: res.arena.z })}`);
  for (const r of rows) console.log(`${String(r.samples).padStart(5)} ${r.vehicles.join('+').padEnd(13)} plaza ${String(r.inPlaza).padStart(4)}  ${r.id}\n        e.g. (${r.example.x}, ${r.example.z}) yaw ${r.example.yaw} · ${r.wheres.slice(0, 4).join(' | ')}`);
  summary.push({ hour, blocked: res.blocked.length, outside: res.blocked.filter(b => !b.plaza).length });
  // the debug views: from above, every collider (blue) and every footprint (red) the car's own test finds round a spot, drawn as boxes over the scene
  // and wherever a line that does not run now left its (hidden) cars
  const hidden = await d(() => (window.__dakar.transport?.lines?.() ?? []).filter(l => !l.on).flatMap(l => l.vehicles.map(v => ({ line: l.id, x: v.x, z: v.z }))));
  console.log('hidden car rapides (a line that does not run now):', JSON.stringify(hidden));
  const views = [...VIEWS, ...hidden.slice(0, 1).map(h => ({ name: `hidden-${h.line}`, x: h.x, z: h.z, r: 12 }))];
  for (const v of views) {
    await d(({ x, z }) => window.__dakar.place(x + 7, z + 7, 0), v); await page.waitForTimeout(1500);   // the player by it: every system round it is live
    const n = await d(({ x, z, r }) => {
      const D = window.__dakar, scene = D.three.scene, found = new Map();
      for (let i = -r; i <= r; i += 0.5) for (let k = -r; k <= r; k += 0.5) {
        const w = D.teranga.solidAt(x + i, z + k, 0.01); if (!w) continue;
        if (w.rect) found.set(`c${w.why}`, { kind: 'collider', ...w.rect }); else if (w.foot) { const f = w.foot; found.set(`f${f.x.toFixed(2)},${f.z.toFixed(2)},${f.yaw.toFixed(2)}`, { kind: 'foot', ...f }); }
      }
      let MeshC = null, BG = null, BA = null, base = null;
      scene.traverse(o => { if (!o.isMesh || !o.geometry) return; if (!MeshC && o.type === 'Mesh' && o.geometry.type === 'BufferGeometry') { MeshC = o.constructor; BG = o.geometry.constructor; BA = o.geometry.attributes.position.constructor; } if (!base && o.material?.type === 'MeshBasicMaterial' && !Array.isArray(o.material)) base = o.material; });
      const mat = (col, wire) => { const m = base.clone(); m.map = null; m.vertexColors = false; m.color.setHex(col); m.transparent = true; m.opacity = wire ? 1 : 0.38; m.depthTest = false; m.depthWrite = false; m.wireframe = wire; m.blending = 1; m.visible = true; m.needsUpdate = true; return m; };
      const box = (cx, cz, yaw, hx, hz, h, col) => {
        const c = Math.cos(yaw), s = Math.sin(yaw), P = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [cx + a * c + b * s, cz - a * s + b * c]);
        const v = [], q = (a, b, cc, dd) => v.push(...a, ...b, ...cc, ...a, ...cc, ...dd);
        const B = P.map(([px, pz]) => [px, 0.15, pz]), T = P.map(([px, pz]) => [px, h, pz]);
        q(T[0], T[1], T[2], T[3]); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; q(B[i], B[j], T[j], T[i]); }
        const g = new BG(); g.setAttribute('position', new BA(new Float32Array(v), 3));
        for (const wire of [false, true]) { const m = new MeshC(g, mat(col, wire)); m.name = 'probe_debug'; m.renderOrder = 9; m.frustumCulled = false; scene.add(m); }
      };
      for (const o of found.values()) {
        if (o.kind === 'collider') box((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2, 0, (o.x1 - o.x0) / 2, (o.z1 - o.z0) / 2, Math.min(3, o.h), 0x2266ff);
        else box(o.x, o.z, o.yaw, o.hw, o.hl, 2.2, 0xff2222);
      }
      return found.size;
    }, v);
    await d(({ x, z }) => window.__dakar.cam([x + 0.01, 46, z + 14], [x, 0, z]), v);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/debug-${v.name}-h${hour}-${quality}.jpg`, quality: 70 });
    await d(() => { const s = window.__dakar.three.scene, gone = []; s.traverse(o => { if (o.name === 'probe_debug') gone.push(o); }); for (const o of gone) { o.removeFromParent(); o.material.dispose(); } window.__dakar.cam(null); });
    console.log(`debug view ${v.name} at hour ${hour}: ${n} solid things drawn`);
  }
}
console.log('\nsummary', JSON.stringify(summary), errors.length ? `page errors: ${errors.slice(0, 3).join(' / ')}` : '');
await browser.close();
