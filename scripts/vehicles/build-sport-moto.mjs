// The « Sabar 600 » sport motorbike (src/transport/sportMoto.ts): from its Meshy model to the game's GLB, reproducibly.
//
//   node scripts/vehicles/build-sport-moto.mjs [assets-src/vehicles/sabar.build.json] [--debug <dir>]
//
// A generated motorbike is ONE fused, textured shell: its wheels cannot spin and its front end cannot steer. This cuts it, by geometry only (no hand edit):
//   1. the shell turned to face +z with its left at +x (`rotateY`), scaled uniformly to `length` (round wheels stay round), on the ground, centred;
//   2. each wheel found (a circle fitted to its tyre's tread, seen from the side) and cut out: the triangles inside the tyre's disc and within the tyre's
//      width (the discs go with it, the fork legs and the swingarm stay): node `axle_<fr|rr>` at the hub > `wheel_*`, spun about X by the game;
//   3. the front end cut out: the fork legs (a line fitted to them is the steering axis, raked as the model has it), the mudguard over the front tyre,
//      the clip-ons and their grips (the mirrors stay on the fairing): node `steer` on the axis (its +Y IS the axis) > `fork`, turned about its own Y
//      by the game, carrying the front wheel;
//   4. the paint: marks that could read as a badge painted plain (`paintout`), then the texture recoloured into each colourway (`paints`): the white
//      panels take the colourway's main colour and the red accents its second one, the shading kept; the first colourway is the GLB's own texture,
//      each other one a JPEG next to it (`<id>.<paint>.jpg`, src/actors/glbVehicle.ts swaps the map);
//   5. the GLB and its sidecar written, then read back and checked (two wheels on the ground and round, the axis, the parts, triangles, file size).
// `--debug <dir>` also writes the parts in flat colours (body grey, wheels blue, front end orange) to look at the cut.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { MeshoptSimplifier } from 'meshoptimizer';
import { weld, simplify, quantize } from '@gltf-transform/functions';
import { io, Document, round } from '../assets/glb-utils.mjs';

const args = process.argv.slice(2), debugAt = args.indexOf('--debug'), debugDir = debugAt >= 0 ? args[debugAt + 1] : null;
const manifestPath = path.resolve(args.find((a, i) => !a.startsWith('--') && (debugAt < 0 || i !== debugAt + 1)) ?? 'assets-src/vehicles/sabar.build.json');
const M = JSON.parse(fs.readFileSync(manifestPath, 'utf8')), dir = path.dirname(manifestPath), repo = path.resolve(dir, '../..');
const srcFile = path.resolve(dir, M.source), outFile = path.resolve(repo, M.out), sideFile = outFile.replace(/\.glb$/, '.json');
if (!fs.existsSync(srcFile)) { console.error(`source not found: ${path.relative(repo, srcFile)} (the raw Meshy model stays in the git-excluded assets-src/meshy_output/)`); process.exit(2); }
const checks = []; const check = (name, ok, value) => { checks.push({ name, ok: !!ok, value }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${value !== undefined ? '  ' + JSON.stringify(value) : ''}`); };

// ---------------------------------------------------------------- 0. read (and, if asked, simplify) the shell
const src = await io.read(srcFile);
if (M.simplifyTris) {
  await MeshoptSimplifier.ready;
  await src.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: M.simplifyTris / triCount(src), error: 0.01, lockBorder: true }));
}
const prims = src.getRoot().listMeshes().flatMap(m => m.listPrimitives());
if (prims.length !== 1) { console.error(`expected one fused primitive, found ${prims.length}`); process.exit(2); }
const prim = prims[0], A = (sem, k) => { const a = prim.getAttribute(sem), n = a.getCount(), o = new Float64Array(n * k), t = []; for (let i = 0; i < n; i++) { a.getElement(i, t); for (let c = 0; c < k; c++) o[i * k + c] = t[c]; } return o; };
const P = A('POSITION', 3), N = A('NORMAL', 3), UV = A('TEXCOORD_0', 2), I = Uint32Array.from(prim.getIndices().getArray()), nv = P.length / 3, nt = I.length / 3;
function triCount(doc) { return doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + p.getIndices().getCount() / 3, 0); }

// ---------------------------------------------------------------- 1. the game's frame: +z forward, +x left, y up, on the ground, centred, to scale
{
  const a = (M.rotateY ?? 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  for (const B of [P, N]) for (let i = 0; i < nv; i++) { const x = B[i * 3], z = B[i * 3 + 2]; B[i * 3] = x * c + z * s; B[i * 3 + 2] = -x * s + z * c; }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i * 3 + k]); hi[k] = Math.max(hi[k], P[i * 3 + k]); }
  const k = M.length / (hi[2] - lo[2]), off = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
  for (let i = 0; i < nv; i++) for (let j = 0; j < 3; j++) P[i * 3 + j] = (P[i * 3 + j] - off[j]) * k;
  console.log(`scaled ×${round(k, 3)} to ${M.length} m long`);
}
const px = i => P[i * 3], py = i => P[i * 3 + 1], pz = i => P[i * 3 + 2];

// ---------------------------------------------------------------- 2. the wheels: a circle fitted to each tyre's tread
function fitWheel(front) {
  // the contact patch: the lowest points of the centre plane at that end
  let cz = 0, cn = 0;
  for (let i = 0; i < nv; i++) if (Math.abs(px(i)) < 0.05 && py(i) < 0.012 && (front ? pz(i) > 0.2 : pz(i) < -0.2)) { cz += pz(i); cn++; }
  let hub = { z: cz / cn, y: 0.32 }, r = 0.32;
  for (let pass = 0; pass < 4; pass++) {
    // the tread: in each 10° sector of the outer half (away from the engine) and the bottom, the farthest centre-plane point near the guessed circle
    const best = new Map();
    for (let i = 0; i < nv; i++) {
      if (Math.abs(px(i)) > 0.045) continue;
      const dz = pz(i) - hub.z, dy = py(i) - hub.y, d = Math.hypot(dz, dy); if (d < r * 0.75 || d > r + 0.06) continue;
      const ang = Math.atan2(dy, front ? dz : -dz) * 180 / Math.PI;           // 0: straight out (ahead of the front wheel, behind the rear one)
      if (ang > 70 || ang < -170) continue;                                    // not the top (mudguard, tail, swingarm) nor the side facing the engine
      const s = Math.floor(ang / 10); if (!best.has(s) || best.get(s).d < d) best.set(s, { z: pz(i), y: py(i), d });
    }
    const pts = [...best.values()];
    // algebraic (Kasa) circle fit
    let Sz = 0, Sy = 0, Szz = 0, Syy = 0, Szy = 0, Sz3 = 0, Sy3 = 0, Szyy = 0, Szzy = 0; const n = pts.length;
    for (const p of pts) { const z = p.z, y = p.y; Sz += z; Sy += y; Szz += z * z; Syy += y * y; Szy += z * y; Sz3 += z * z * z; Sy3 += y * y * y; Szyy += z * y * y; Szzy += z * z * y; }
    const C = n * Szz - Sz * Sz, D = n * Szy - Sz * Sy, E = n * Sz3 + n * Szyy - (Szz + Syy) * Sz, G = n * Syy - Sy * Sy, H = n * Sy3 + n * Szzy - (Szz + Syy) * Sy;
    const az = (G * E - D * H) / (2 * (C * G - D * D)), ay = (C * H - D * E) / (2 * (C * G - D * D));
    hub = { z: az, y: ay }; r = Math.sqrt(pts.reduce((s, p) => s + (p.z - az) ** 2 + (p.y - ay) ** 2, 0) / n);
  }
  let w = 0; for (let i = 0; i < nv; i++) if (Math.hypot(pz(i) - hub.z, py(i) - hub.y) > r - 0.04 && Math.hypot(pz(i) - hub.z, py(i) - hub.y) < r + 0.01) w = Math.max(w, Math.abs(px(i)) < 0.12 ? Math.abs(px(i)) : 0);
  return { z: hub.z, y: hub.y, r, tread: w * 2 };
}
const wf = fitWheel(true), wr = fitWheel(false);
console.log('front wheel', { z: round(wf.z), y: round(wf.y), r: round(wf.r), tread: round(wf.tread) }, 'rear wheel', { z: round(wr.z), y: round(wr.y), r: round(wr.r), tread: round(wr.tread) });

// ---------------------------------------------------------------- 3. the steering axis: a line fitted to the fork legs (side view: z = a + b y)
let axis;
{
  const [l0, l1] = M.fork.legs; let n = 0, Sy = 0, Sz = 0, Syy = 0, Syz = 0, top = 0;
  for (let i = 0; i < nv; i++) {
    const ax = Math.abs(px(i)); if (ax < l0 || ax > l1) continue;
    const y = py(i), z = pz(i); if (y < wf.y + 0.12 || y > wf.y + 0.45 || z < wf.z - 0.35 || z > wf.z + 0.1) continue;
    n++; Sy += y; Sz += z; Syy += y * y; Syz += y * z;
  }
  const b = (n * Syz - Sy * Sz) / (n * Syy - Sy * Sy), a = (Sz - b * Sy) / n;
  // the top of the legs: the highest leg point within reach of the line
  for (let i = 0; i < nv; i++) { const ax = Math.abs(px(i)); if (ax >= l0 && ax <= l1 && Math.abs(pz(i) - (a + b * py(i))) < 0.05 && py(i) < wf.y + 0.9) top = Math.max(top, py(i)); }
  const rake = Math.atan(-b);
  axis = { a, b, rake, top, dir: [0, Math.cos(rake), -Math.sin(rake)], pivot: [0, top, a + b * top] };
  console.log('steering axis', { rake: round(rake * 180 / Math.PI, 1) + '°', pivot: axis.pivot.map(v => round(v)), legPoints: n, passesHub: round(a + b * wf.y - wf.z) });
}
/** Distance in the side view from (y, z) to the steering axis line. */
const offAxis = (y, z) => Math.abs(z - (axis.a + axis.b * y)) * Math.cos(axis.rake);

// ---------------------------------------------------------------- 4. the bars: where the clip-ons are (the widest thing just below the top clamp, in front of the tank)
let bars;
{
  const [x0, x1] = M.bars.halfWidth; let n = 0, sy = 0, sz = 0;
  for (let i = 0; i < nv; i++) { const ax = Math.abs(px(i)); if (ax > x1 - 0.1 && ax < x1 - 0.02 && Math.abs(py(i) - axis.top) < 0.12 && Math.abs(pz(i) - axis.pivot[2]) < 0.2) { n++; sy += py(i); sz += pz(i); } }
  bars = { y: n ? sy / n : axis.top, z: n ? sz / n : axis.pivot[2], points: n };
  console.log('clip-ons', { y: round(bars.y), z: round(bars.z), points: n });
  void x0;
}

// ---------------------------------------------------------------- 5. every triangle to its part
const PART = { body: 0, wheelF: 1, wheelR: 2, fork: 3 };
const part = new Uint8Array(nt);
/** Whether each corner of the triangle is in the region: a part is whole triangles only, so a long sliver of the tank that merely passes the axis stays on the tank. */
const every = (t, f) => f(I[t * 3]) && f(I[t * 3 + 1]) && f(I[t * 3 + 2]);
const tyreOf = w => i => Math.abs(px(i)) < M.wheels.halfWidth && Math.hypot(pz(i) - w.z, py(i) - w.y) < w.r + M.wheels.margin;
const legOf = i => Math.abs(px(i)) < M.fork.halfWidth && py(i) > wf.y - 0.08 && py(i) <= axis.top + 0.02 && offAxis(py(i), pz(i)) < M.fork.reach;
const guardOf = i => { const d = Math.hypot(pz(i) - wf.z, py(i) - wf.y); return Math.abs(px(i)) < 0.09 && py(i) > wf.y + 0.1 && d > wf.r - 0.02 && d < wf.r + M.fork.guard && Math.abs(pz(i) - wf.z) < wf.r * 0.95; };
const [b0, b1] = M.bars.halfWidth, barOf = i => { const ax = Math.abs(px(i)); return ax > b0 && ax < b1 && py(i) > bars.y + M.bars.dy[0] && py(i) < bars.y + M.bars.dy[1] && pz(i) > bars.z + M.bars.dz[0] && pz(i) < bars.z + M.bars.dz[1]; };
const frontOf = i => legOf(i) || guardOf(i) || barOf(i);
const tyreF = tyreOf(wf), tyreR = tyreOf(wr);
for (let t = 0; t < nt; t++) part[t] = every(t, tyreF) ? PART.wheelF : every(t, tyreR) ? PART.wheelR : every(t, frontOf) ? PART.fork : PART.body;
// the wheels are dark and round: simplified (meshoptimizer) to `wheels.tris` each; the shell's paint, on a fragmented atlas, is left as Meshy made it
if (M.wheels.tris) {
  await MeshoptSimplifier.ready;
  const keep = new Uint8Array(nt).fill(1);
  for (const k of [PART.wheelF, PART.wheelR]) {
    const tris = []; for (let t = 0; t < nt; t++) if (part[t] === k) tris.push(t);
    // welded by position first (Meshy splits every UV seam: unwelded, each island is a border the simplifier may not touch); a seam's UV then comes from one
    // side of it, which on a black tyre and a dark rim does not show
    const canon = new Map(), weldOf = i => { const k = `${Math.round(px(i) * 1000)},${Math.round(py(i) * 1000)},${Math.round(pz(i) * 1000)}`; let c = canon.get(k); if (c === undefined) canon.set(k, c = i); return c; };
    const idx = new Uint32Array(tris.length * 3); tris.forEach((t, j) => { for (let c = 0; c < 3; c++) idx[j * 3 + c] = weldOf(I[t * 3 + c]); });
    const [out] = M.wheels.sloppy ? MeshoptSimplifier.simplifySloppy(idx, new Float32Array(P), 3, null, M.wheels.tris * 3, M.wheels.error ?? 0.02) : MeshoptSimplifier.simplify(idx, new Float32Array(P), 3, M.wheels.tris * 3, M.wheels.error ?? 0.02, M.wheels.lockBorder === false ? [] : ['LockBorder']);
    const left = new Set(); for (let j = 0; j < out.length; j += 3) left.add(`${out[j]},${out[j + 1]},${out[j + 2]}`);
    // the simplifier returns new triangles over the same vertices: put them in place of the old ones (the slots left over are dropped)
    tris.forEach((t, j) => { if (j * 3 < out.length) { I[t * 3] = out[j * 3]; I[t * 3 + 1] = out[j * 3 + 1]; I[t * 3 + 2] = out[j * 3 + 2]; } else keep[t] = 0; });
    console.log(`wheel ${k === PART.wheelF ? 'front' : 'rear'}: ${tris.length} -> ${out.length / 3} triangles`);
  }
  for (let t = 0; t < nt; t++) if (!keep[t]) part[t] = 255;
}
// what nobody ever sees of the shell (its inside: the engine bay under the fairing, the backs of panels) is dropped: ID renders from `cull.views` directions
// round and above the bike (orthographic, `cull.res` px over its length), the shell alone as the occluder (the wheels and the turning front end hide
// nothing for good). A triangle that never wins a pixel is not drawn.
if (M.cull) {
  const R = M.cull.res, S = R / (M.length * 1.15), dirs = [];
  for (const el of [-0.35, 0, 0.3, 0.65, 1.05]) for (let k = 0; k < M.cull.azimuths; k++) { const az = (k * 2 * Math.PI) / M.cull.azimuths; dirs.push([Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]); }
  dirs.push([0, 1, 0]);
  const body = []; for (let t = 0; t < nt; t++) if (part[t] === PART.body) body.push(t);
  const seen = new Uint8Array(nt), zb = new Float32Array(R * R), ib = new Int32Array(R * R), cy = M.length * 0.3;
  for (const d of dirs) {
    const f = [-d[0], -d[1], -d[2]], up = Math.abs(f[1]) < 0.95 ? [0, 1, 0] : [0, 0, 1];
    let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]]; const rl = Math.hypot(...r); r = r.map(v => v / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    zb.fill(Infinity); ib.fill(-1);
    const sx = i => (px(i) * r[0] + (py(i) - cy) * r[1] + pz(i) * r[2]) * S + R / 2, sy = i => -(px(i) * u[0] + (py(i) - cy) * u[1] + pz(i) * u[2]) * S + R / 2, sz = i => px(i) * f[0] + py(i) * f[1] + pz(i) * f[2];
    for (const t of body) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      const ax = sx(a), ay = sy(a), bx = sx(b), by = sy(b), cx = sx(c), cyy = sy(c), az = sz(a), bz = sz(b), cz = sz(c);
      const den = (by - cyy) * (ax - cx) + (cx - bx) * (ay - cyy); if (Math.abs(den) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(R - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cyy))), y1 = Math.min(R - 1, Math.ceil(Math.max(ay, by, cyy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const gx = x + 0.5, gy = y + 0.5, w0 = ((by - cyy) * (gx - cx) + (cx - bx) * (gy - cyy)) / den, w1 = ((cyy - ay) * (gx - cx) + (ax - cx) * (gy - cyy)) / den, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * az + w1 * bz + w2 * cz, o = y * R + x; if (z < zb[o]) { zb[o] = z; ib[o] = t; }
      }
    }
    for (let o = 0; o < R * R; o++) if (ib[o] >= 0) seen[ib[o]] = 1;
  }
  let dropped = 0; for (const t of body) if (!seen[t]) { part[t] = 255; dropped++; }
  console.log(`hidden inside the shell: ${dropped} of its ${body.length} triangles (${dirs.length} views at ${R} px), not drawn`);
}
const count = k => part.reduce((s, p) => s + (p === k ? 1 : 0), 0);
console.log('triangles', { body: count(0), frontWheel: count(1), rearWheel: count(2), frontEnd: count(3) });

// ---------------------------------------------------------------- 6. paint: plain where a mark could read as a badge, then each colourway
const texImg = prim.getMaterial()?.getBaseColorTexture()?.getImage();
if (!texImg) { console.error('the source has no base colour texture'); process.exit(2); }
const raw = await sharp(Buffer.from(texImg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const TW = raw.info.width, TH = raw.info.height, base = new Float32Array(raw.data.length);
for (let i = 0; i < raw.data.length; i++) base[i] = raw.data[i] / 255;
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx]; };
/** What a texel is: 1 the white bodywork, 2 a red accent, 0 anything else (black frame, tyres, glass, metal). */
const kindOf = (r, g, b) => { const [h, s, v] = hsv(r, g, b); if (s < 0.16 && v > 0.74) return 1; if ((h > 335 || h < 22) && s > 0.42 && v > 0.28) return 2; return 0; };
// paint-out: where Meshy drew a mark that could read as a badge or lettering (on the tank, the fairing's flanks, the nose, the tail), the paint of each
// triangle inside the sphere (`at`, `r`; `mirror`: both sides; `minX` / `minY`: only the outer skin, never the fork or the frame) is laid plain over it,
// in texture space. Only a triangle that is mostly paint is touched (the black frame, the glass and the metal keep their texels).
const texelsOf = t => {
  const v = [0, 1, 2].map(k => I[t * 3 + k]), us = v.map(i => UV[i * 2] * TW), vs = v.map(i => UV[i * 2 + 1] * TH), out = [];
  const d = (vs[1] - vs[2]) * (us[0] - us[2]) + (us[2] - us[1]) * (vs[0] - vs[2]); if (Math.abs(d) < 1e-9) return out;
  for (let y = Math.floor(Math.min(...vs)) - 1; y <= Math.ceil(Math.max(...vs)) + 1; y++) for (let x = Math.floor(Math.min(...us)) - 1; x <= Math.ceil(Math.max(...us)) + 1; x++) {
    if (x < 0 || y < 0 || x >= TW || y >= TH) continue;
    const l1 = ((vs[1] - vs[2]) * (x + 0.5 - us[2]) + (us[2] - us[1]) * (y + 0.5 - vs[2])) / d, l2 = ((vs[2] - vs[0]) * (x + 0.5 - us[2]) + (us[0] - us[2]) * (y + 0.5 - vs[2])) / d;
    if (l1 >= -0.15 && l2 >= -0.15 && 1 - l1 - l2 >= -0.15) out.push(y * TW + x);   // a texel's margin round the triangle: no seam of the old mark left
  }
  return out;
};
for (const po of M.paintout) {
  const fill = po.colour === 'accent' ? [0.85, 0.08, 0.1] : [0.93, 0.93, 0.92];
  let tris = 0, painted = 0;
  for (const sx of po.mirror ? [1, -1] : [1]) {
    const c = [po.at[0] * sx, po.at[1], po.at[2]];
    const at = (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) < po.r && Math.abs(x) >= (po.minX ?? 0) && y >= (po.minY ?? -1), inside = i => at(px(i), py(i), pz(i));
    // `centroid`: a triangle whose middle is in the sphere is taken whole, however far it reaches (the tank's top is a few large ones)
    const mid = t => { const a = I[t * 3], b = I[t * 3 + 1], d = I[t * 3 + 2]; return at((px(a) + px(b) + px(d)) / 3, (py(a) + py(b) + py(d)) / 3, (pz(a) + pz(b) + pz(d)) / 3); };
    for (let t = 0; t < nt; t++) {
      if (!(po.centroid ? mid(t) : every(t, inside))) continue;
      const tx = texelsOf(t); if (!tx.length) continue;
      const paint = tx.filter(o => kindOf(base[o * 3], base[o * 3 + 1], base[o * 3 + 2]) !== 0).length;
      if (paint < tx.length * (po.paintShare ?? 0.4)) continue;
      for (const o of tx) { base[o * 3] = fill[0]; base[o * 3 + 1] = fill[1]; base[o * 3 + 2] = fill[2]; }
      tris++; painted += tx.length;
    }
  }
  console.log(`painted out ${po.what ?? ''} round ${po.at.join(', ')} (r ${po.r}): ${tris} triangles, ${painted} texels`);
}
const rgb = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16) / 255);
const kinds = new Uint8Array(TW * TH), share = [0, 0, 0];
for (let i = 0; i < TW * TH; i++) { kinds[i] = kindOf(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]); share[kinds[i]]++; }
console.log('texels', { white: round(share[1] / (TW * TH)), red: round(share[2] / (TW * TH)), other: round(share[0] / (TW * TH)) });
async function colourway(p) {
  const prim1 = rgb(p.primary), acc = rgb(p.accent), out = Buffer.alloc(TW * TH * 3);
  for (let i = 0; i < TW * TH; i++) {
    const r = base[i * 3], g = base[i * 3 + 1], b = base[i * 3 + 2], k = kinds[i];
    let o = [r, g, b];
    if (k === 1) { const l = Math.min(1.08, Math.max(r, g, b) / 0.93); o = prim1.map(c => c * l); }                     // the white panels: the main colour, as lit as the white was
    else if (k === 2) { const l = Math.min(1.1, Math.max(r, g, b) / 0.85); o = acc.map(c => c * l); }                   // the red accents: the second colour
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(o[c] * 255)));
  }
  return sharp(out, { raw: { width: TW, height: TH, channels: 3 } }).resize(M.textureMax, M.textureMax).jpeg({ quality: M.textureQuality, mozjpeg: true }).toBuffer();
}
const paintTex = [];
for (const p of M.paints) paintTex.push(await colourway(p));

// ---------------------------------------------------------------- 7. the GLB: body, rear wheel, the front end on its axis with the front wheel in it
const doc = new Document(), buf = doc.createBuffer();
const tex = doc.createTexture('paint').setImage(new Uint8Array(paintTex[0])).setMimeType('image/jpeg');
const mat = doc.createMaterial('paint').setBaseColorTexture(tex).setRoughnessFactor(0.8).setMetallicFactor(0).setDoubleSided(false);
const rotX = a => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const R = -axis.rake, cR = Math.cos(R), sR = Math.sin(R);
/** Into the steering axis' frame (its origin at the pivot, its +Y along the axis): the inverse of the `steer` node's rotation about X by R. */
const toAxis = (v, o) => { const y = v[1] - o[1], z = v[2] - o[2]; return [v[0] - o[0], y * cR + z * sR, -y * sR + z * cR]; };
const toAxisDir = v => [v[0], v[1] * cR + v[2] * sR, -v[1] * sR + v[2] * cR];
function meshOf(name, k, place, material = mat) {
  const used = new Map(), pos = [], nor = [], uv = [], idx = [];
  for (let t = 0; t < nt; t++) if (part[t] === k) for (let c = 0; c < 3; c++) {
    const i = I[t * 3 + c]; let j = used.get(i);
    if (j === undefined) {
      j = used.size; used.set(i, j);
      const [p, n] = place([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]);
      pos.push(...p); nor.push(...n); uv.push(UV[i * 2], UV[i * 2 + 1]);
    }
    idx.push(j);
  }
  const prim2 = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(used.size < 65536 ? new Uint16Array(idx) : new Uint32Array(idx)).setBuffer(buf));
  return doc.createMesh(name).addPrimitive(prim2);
}
const r3 = v => v.map(x => round(x, 4));
// every mesh on a leaf node of its own: the nodes the game turns (wheel_*: spin, fork: steering) keep their pivot whatever quantisation does to a mesh's node
const leaf = (name, mesh) => doc.createNode(name).setMesh(mesh);
const body = leaf('body', meshOf('body', PART.body, (p, n) => [p, n]));
const rear = doc.createNode('axle_rr').setTranslation(r3([0, wr.y, wr.z])).setExtras({ r: round(wr.r, 4) })
  .addChild(doc.createNode('wheel_rr').addChild(leaf('wheel_rr_mesh', meshOf('wheel_rr', PART.wheelR, (p, n) => [[p[0], p[1] - wr.y, p[2] - wr.z], n]))));
const hubF = toAxis([0, wf.y, wf.z], axis.pivot);
const front = doc.createNode('axle_fr').setTranslation(r3(hubF)).setExtras({ r: round(wf.r, 4) })
  .addChild(doc.createNode('wheel_fr').addChild(leaf('wheel_fr_mesh', meshOf('wheel_fr', PART.wheelF, (p, n) => [toAxisDir([p[0], p[1] - wf.y, p[2] - wf.z]), toAxisDir(n)]))));
const fork = doc.createNode('fork').addChild(leaf('front_end', meshOf('front_end', PART.fork, (p, n) => [toAxis(p, axis.pivot), toAxisDir(n)]))).addChild(front);
const steer = doc.createNode('steer').setTranslation(r3(axis.pivot)).setRotation(rotX(R)).setExtras({ rake: round(axis.rake, 4) }).addChild(fork);
const root = doc.createNode(M.id).addChild(body).addChild(rear).addChild(steer);
doc.createScene(M.id).addChild(root);
if (debugDir) {                                                     // the cut in flat colours, to look at
  fs.mkdirSync(debugDir, { recursive: true });
  const cols = [[0.72, 0.72, 0.72], [0.2, 0.45, 0.95], [0.2, 0.45, 0.95], [0.98, 0.55, 0.1]];
  const mats = cols.map((c, k) => doc.createMaterial(`part${k}`).setBaseColorFactor([...c, 1]));
  for (const m of doc.getRoot().listMeshes()) { const k = { body: 0, wheel_fr: 1, wheel_rr: 2, front_end: 3 }[m.getName()]; for (const p of m.listPrimitives()) p.setMaterial(mats[k]); }
  await io.write(path.join(debugDir, `${M.id}.parts.glb`), doc);
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setMaterial(mat);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
if (M.quantize !== false) await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }));   // KHR_mesh_quantization (three's GLTFLoader reads it): half the bytes
await io.write(outFile, doc);
const paintFiles = [];
for (let k = 1; k < M.paints.length; k++) { const f = outFile.replace(/\.glb$/, `.${M.paints[k].id}.jpg`); fs.writeFileSync(f, paintTex[k]); paintFiles.push(path.basename(f)); }

// ---------------------------------------------------------------- 8. read back and check
const back = await io.read(outFile), nodes = n => back.getRoot().listNodes().find(x => x.getName() === n);
const worldPts = name => { const n = nodes(name), m = n.getWorldMatrix(), pos = n.getMesh().listPrimitives()[0].getAttribute('POSITION'), t = [], out = []; for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, t); out.push([m[0] * t[0] + m[4] * t[1] + m[8] * t[2] + m[12], m[1] * t[0] + m[5] * t[1] + m[9] * t[2] + m[13], m[2] * t[0] + m[6] * t[1] + m[10] * t[2] + m[14]]); } return out; };
const all = ['body', 'wheel_rr_mesh', 'front_end', 'wheel_fr_mesh'].flatMap(worldPts), lo = [0, 1, 2].map(k => Math.min(...all.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...all.map(p => p[k])));
for (const [id, w] of [['fr', wf], ['rr', wr]]) {
  const pts = worldPts(`wheel_${id}_mesh`), bottom = Math.min(...pts.map(p => p[1])), hub = nodes(`axle_${id}`).getWorldTranslation();
  check(`${id}: a separate wheel (axle_${id} > wheel_${id}), hub at y ${round(hub[1])} = its radius ${round(w.r)} (2 cm), tyre on the ground (2 cm), radius 0.28-0.36 m`, Math.abs(hub[1] - w.r) < 0.02 && Math.abs(bottom) < 0.02 && w.r > 0.28 && w.r < 0.36, { hub: r3(hub), r: round(w.r), bottom: round(bottom) });
}
const wb = wf.z - wr.z;
check(`wheelbase ${round(wb, 2)} m (a sport bike: 1.3-1.5 m)`, wb > 1.25 && wb < 1.5, round(wb));
check(`steering axis raked ${round(axis.rake * 180 / Math.PI, 1)}° (20-30°), passing within 6 cm of the front hub`, axis.rake > 0.33 && axis.rake < 0.53 && Math.abs(axis.a + axis.b * wf.y - wf.z) < 0.06, { pivot: r3(axis.pivot) });
check('the front end (fork, mudguard, clip-ons) turns about it: node steer > fork > (front_end, axle_fr > wheel_fr)', !!nodes('fork') && nodes('steer').listChildren().includes(nodes('fork')) && nodes('fork').listChildren().includes(nodes('axle_fr')), count(PART.fork));
const tris = triCount(back), bytes = fs.statSync(outFile).size;
check(`overall ${round(hi[2] - lo[2], 2)} x ${round(hi[0] - lo[0], 2)} x ${round(hi[1] - lo[1], 2)} m (L x W x H), on the ground, centred`, Math.abs(hi[2] - lo[2] - M.length) < 0.01 && Math.abs(lo[1]) < 0.005 && Math.abs(lo[0] + hi[0]) < 0.05);
check(`triangles ${tris} <= ${M.maxTris ?? 16500}`, tris <= (M.maxTris ?? 16500), tris);
check(`file ${Math.round(bytes / 1024)} kB <= ${M.maxKB ?? 1300} kB, draw calls ${back.getRoot().listMeshes().length} (one material)`, bytes / 1024 <= (M.maxKB ?? 1300) && back.getRoot().listMaterials().length === 1, Math.round(bytes / 1024));
const side = {
  id: M.id, name: M.name, provenance: M.provenance, source: path.relative(repo, srcFile), sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(srcFile)).digest('hex'),
  kit: { kind: 'moto', model: M.id }, length: round(hi[2] - lo[2]), width: round(hi[0] - lo[0]), height: round(hi[1] - lo[1]),
  wheels: [{ id: 'fr', y: round(wf.y), z: round(wf.z), r: round(wf.r), tread: round(wf.tread), steer: true }, { id: 'rr', y: round(wr.y), z: round(wr.z), r: round(wr.r), tread: round(wr.tread), steer: false }],
  steer: { pivot: r3(axis.pivot), axis: r3(axis.dir), rake: round(axis.rake, 4) }, bars: { y: round(bars.y), z: round(bars.z) },
  parts: { body: count(PART.body), wheel_fr: count(PART.wheelF), wheel_rr: count(PART.wheelR), front_end: count(PART.fork) },
  paints: M.paints.map((p, k) => ({ id: p.id, name: p.name, primary: p.primary, accent: p.accent, texture: k ? paintFiles[k - 1] : 'embedded', kB: Math.round(paintTex[k].length / 1024) })),
  interior: false, tris, drawCalls: back.getRoot().listMeshes().length, bytes, checks,
};
fs.writeFileSync(sideFile, JSON.stringify(side, null, 1) + '\n');
const failed = checks.filter(c => !c.ok).length;
console.log(`\n${path.relative(repo, outFile)}  ${Math.round(bytes / 1024)} kB, ${tris} tris, ${side.drawCalls} draw calls, ${M.paints.length} colourways  ->  ${failed ? failed + ' CHECK(S) FAILED' : 'all checks pass'}`);
process.exit(failed ? 1 : 0);
