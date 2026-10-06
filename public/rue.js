import * as THREE from 'three';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// =====================================================================
// Dakar Life · Rue — open-world driving in a stylised Dakar
// =====================================================================

// ---------------------------------------------------------------- world constants
const N = 10;            // blocks per axis
const B = 56;            // block size (m)
const R = 16;            // road width
const S = B + R;
const W = N * S + R;
const HALF = W / 2;
const LANE = 4;          // lane offset from road centre (right-hand traffic)
const SIDEWALK = 4;
const BEACH = 36;
const roadC = k => -HALF + R / 2 + k * S;
const bMin = i => roadC(i) + R / 2;
const bMax = i => roadC(i + 1) - R / 2;
const CITY0 = roadC(0) - R / 2, CITY1 = roadC(N) + R / 2;
const XMIN = CITY0 - BEACH, ZMIN = CITY0 - BEACH, ZMAX = CITY1 + BEACH, XMAX = CITY1 + 40;
const SEA_X = XMIN, SEA_Z0 = ZMIN, SEA_Z1 = ZMAX;

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = rng(20261006);
const R01 = Math.random;
const pick = (a, r = R01) => a[Math.floor(r() * a.length)];
const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';
const fwd = h => ({ x: Math.sin(h), z: Math.cos(h) });
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ---------------------------------------------------------------- districts & landmarks
function blockIdx(v) { return clamp(Math.floor((v - bMin(0) + R / 2) / S), 0, N - 1); }
function districtOf(i, j) {
  if (i <= 2 && j <= 2) return 'Les Almadies';
  if (j <= 1 && i <= 6) return 'Yoff';
  if (i >= 7 && j <= 3) return 'Parcelles Assainies';
  if (i >= 7) return 'Pikine';
  if (i <= 2 && j <= 4) return 'Ouakam';
  if (i <= 2 && j <= 7) return 'Fann · Point E';
  if (j >= 8 && i <= 4) return 'Plateau';
  if (j >= 6 && i <= 4) return 'Médina';
  if (j >= 6) return 'Colobane';
  return 'Grand Yoff';
}
function districtAt(x, z) {
  if (x < CITY0 || z < CITY0 || z > CITY1) return x < CITY0 ? 'La Corniche' : (z < CITY0 ? 'Plage de Yoff' : 'Cap Manuel');
  return districtOf(blockIdx(x), blockIdx(z));
}
const SPECIAL = {
  '1,3': { type: 'monument', name: 'Monument de la Renaissance' },
  '0,4': { type: 'phare', name: 'Phare des Mamelles' },
  '1,6': { type: 'ucad', name: 'UCAD' },
  '3,8': { type: 'market', name: 'Marché Sandaga' },
  '1,9': { type: 'plaza', name: 'Place de l’Indépendance' },
  '4,7': { type: 'mosque', name: 'Grande Mosquée' },
  '4,3': { type: 'stadium', name: 'Stade Léopold Sédar Senghor' },
  '6,7': { type: 'gare', name: 'Gare de Colobane' },
  '5,5': { type: 'market', name: 'Marché HLM' },
  '8,6': { type: 'arena', name: 'Arène nationale' },
  '2,5': { type: 'park', name: 'Parc de Hann' },
  '7,1': { type: 'park', name: 'Unité 15 des Parcelles' },
  '3,1': { type: 'police', name: 'Commissariat de Yoff' },
  '0,1': { type: 'resto', name: 'La Pointe des Almadies' },
  '9,8': { type: 'park', name: 'Terrain de Thiaroye' },
};
const DESTS = Object.entries(SPECIAL).map(([k, v]) => {
  const [i, j] = k.split(',').map(Number);
  return { name: v.name, x: (bMin(i) + bMax(i)) / 2, z: roadC(j + 1) - LANE, i, j };
}).concat([{ name: 'Plage de Yoff', x: roadC(5), z: CITY0 - 10 }, { name: 'Corniche Ouest', x: CITY0 - 10, z: roadC(6) }]);

// ---------------------------------------------------------------- renderer & scene
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color('#9BD3F0'), DUSK_SKY = new THREE.Color('#F49A6C'), NIGHT_SKY = new THREE.Color('#0B1430');
scene.background = DAY_SKY.clone();
scene.fog = new THREE.Fog(DAY_SKY.clone(), TOUCH ? 110 : 140, TOUCH ? 380 : 520);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, TOUCH ? 420 : 900);
camera.position.set(0, 30, 40);
const hemi = new THREE.HemisphereLight(0xdfefff, 0xb59c74, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 400 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const nightU = { value: 0 };

const MAT = {};
const lam = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
MAT.asphalt = lam('#3B3F46');
MAT.sidewalk = lam('#CFC6B4');
MAT.sand = lam('#E8D3A2');
MAT.sea = lam('#2C8CC4', { emissive: '#0a2a44', emissiveIntensity: 0.15 });
MAT.grass = lam('#7DA35A');
MAT.white = lam('#F4F1EA');
MAT.line = lam('#F1EFE6');
MAT.yline = lam('#F2B300');
MAT.black = lam('#16181C');
MAT.dark = lam('#2A2E35');
MAT.bronze = lam('#7A5230');
MAT.green = lam('#1E8E5A');
MAT.trunk = lam('#7B6A55');
MAT.leaf = lam('#4D8B3A');
MAT.palm = lam('#3E8A44');
MAT.glass = lam('#1C2733', { emissive: '#ffd27a', emissiveIntensity: 0 });
MAT.lamp = lam('#FFF2C0', { emissive: '#FFD27A', emissiveIntensity: 0 });
MAT.head = lam('#FFFBE6', { emissive: '#FFF6D0', emissiveIntensity: 0.2 });
MAT.tail = lam('#B3121F', { emissive: '#FF2A2A', emissiveIntensity: 0.3 });
MAT.skin = lam('#5A3825');
MAT.pole = lam('#5F6670');

function buildingMaterial() {
  const m = lam('#ffffff');
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = nightU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 dlw = vec4(transformed, 1.0);
        vec3 dln = objectNormal;
        #ifdef USE_INSTANCING
          dlw = instanceMatrix * dlw; dln = mat3(instanceMatrix) * dln;
        #endif
        dlw = modelMatrix * dlw; vWP = dlw.xyz; vWN = normalize(mat3(modelMatrix) * dln);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN; uniform float uNight;
        float dlHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float dlWin = 0.0; float dlLit = 0.0;
        if (abs(vWN.y) < 0.5 && vWP.y > 3.2) {
          float u = dot(vWP.xz, vec2(-vWN.z, vWN.x));
          vec2 g = vec2(u / 3.1, (vWP.y - 3.2) / 3.4);
          vec2 cc = fract(g);
          dlWin = step(0.22, cc.x) * step(cc.x, 0.78) * step(0.26, cc.y) * step(cc.y, 0.8);
          dlLit = step(0.52, dlHash(floor(g) + floor(vWP.xz * 0.04)));
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.19, 0.25), dlWin * 0.82);
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.42) * dlWin * dlLit * uNight * 0.95;`);
  };
  return m;
}

// ---------------------------------------------------------------- collision
const solids = new Map(); // key "i,j" -> [{x0,z0,x1,z1}]
const roundSolids = [];  // {x,z,r}
function addSolid(i, j, x0, z0, x1, z1) { const k = i + ',' + j; if (!solids.has(k)) solids.set(k, []); solids.get(k).push({ x0, z0, x1, z1 }); }
const _hit = { x: 0, z: 0, nx: 0, nz: 0, d: 0 };
function pushOut(px, pz, r) {
  // returns correction vector & normal of deepest contact, or null
  let best = null;
  const bi = Math.floor((px - CITY0) / S), bj = Math.floor((pz - CITY0) / S);
  for (let i = bi - 1; i <= bi + 1; i++) for (let j = bj - 1; j <= bj + 1; j++) {
    const L = solids.get(i + ',' + j); if (!L) continue;
    for (const s of L) {
      const cx = clamp(px, s.x0, s.x1), cz = clamp(pz, s.z0, s.z1);
      let dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let nx, nz, depth;
      if (d2 < 1e-6) { // centre inside box: push to nearest face
        const l = px - s.x0, rr = s.x1 - px, t = pz - s.z0, b = s.z1 - pz, m = Math.min(l, rr, t, b);
        if (m === l) { nx = -1; nz = 0; } else if (m === rr) { nx = 1; nz = 0; } else if (m === t) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
        depth = m + r;
      } else { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; depth = r - d; }
      if (!best || depth > best.d) best = { nx, nz, d: depth };
    }
  }
  for (const c of roundSolids) {
    const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), rr = c.r + r;
    if (d < rr && d > 1e-4 && (!best || rr - d > best.d)) best = { nx: dx / d, nz: dz / d, d: rr - d };
  }
  // world limits (sea walls & dunes)
  const lim = [[px - (XMIN + 2), 1, 0], [(XMAX - 2) - px, -1, 0], [pz - (ZMIN + 2), 0, 1], [(ZMAX - 2) - pz, 0, -1]];
  for (const [gap, nx, nz] of lim) if (gap < r && (!best || r - gap > best.d)) best = { nx, nz, d: r - gap };
  return best;
}

// ---------------------------------------------------------------- city build
const dummy = new THREE.Object3D();
const colorTmp = new THREE.Color();
function instanced(geo, mat, list, { cast = true, receive = true, colors = false } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((t, k) => {
    dummy.position.set(t.x, t.y || 0, t.z);
    dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    dummy.scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix);
    if (colors) m.setColorAt(k, colorTmp.set(t.c || '#ffffff'));
  });
  m.count = list.length;
  m.castShadow = cast; m.receiveShadow = receive;
  scene.add(m); return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
BOX.translate(0, 0.5, 0);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); CYL.translate(0, 0.5, 0);

const PAL = {
  default: ['#EDE6D6', '#E8D3A9', '#D9B77E', '#C98C5A', '#F2EFE8', '#B9D3D9', '#E7B8A7', '#C6D3A8', '#F0D27A', '#D7C9E0', '#E9C4A0'],
  'Plateau': ['#F2EFE8', '#DCDFE3', '#B7C7D6', '#E9E3D3', '#C9B79A', '#9FB4C7'],
  'Les Almadies': ['#FFFFFF', '#F5F0E6', '#EDE4D3', '#F7E9D7'],
  'Pikine': ['#D9B77E', '#C98C5A', '#E8D3A9', '#B98B6A', '#DCC7A0', '#A9C1B5'],
};
const HEIGHT = { 'Plateau': [16, 52], 'Médina': [6, 14], 'Les Almadies': [5, 9], 'Pikine': [4, 10], 'Parcelles Assainies': [5, 11], 'Yoff': [5, 13], 'Grand Yoff': [7, 22], 'Fann · Point E': [8, 24], 'Colobane': [6, 16], 'Ouakam': [5, 12] };

function buildCity() {
  // sea & sand & asphalt
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), MAT.sea); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.6; scene.add(sea);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(XMAX - XMIN + 60, ZMAX - ZMIN), MAT.sand); sand.rotation.x = -Math.PI / 2; sand.position.set((XMIN + XMAX + 60) / 2, -0.08, (ZMIN + ZMAX) / 2); sand.receiveShadow = true; scene.add(sand);
  const asph = new THREE.Mesh(new THREE.PlaneGeometry(CITY1 - CITY0, CITY1 - CITY0), MAT.asphalt); asph.rotation.x = -Math.PI / 2; asph.position.set((CITY0 + CITY1) / 2, 0, (CITY0 + CITY1) / 2); asph.receiveShadow = true; scene.add(asph);
  // east land beyond the city
  const east = new THREE.Mesh(new THREE.PlaneGeometry(400, ZMAX - ZMIN), MAT.sand); east.rotation.x = -Math.PI / 2; east.position.set(XMAX + 200, -0.08, (ZMIN + ZMAX) / 2); scene.add(east);

  const slabs = [], buildings = [], roofs = [], greens = [], lines = [], ylines = [], lamps = [], lampHeads = [], trunks = [], crowns = [], palms = [], fronds = [], stalls = [], awnings = [], misc = [], whites = [], darks = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x0 = bMin(i), x1 = bMax(i), z0 = bMin(j), z1 = bMax(j), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const sp = SPECIAL[i + ',' + j]; const dist = districtOf(i, j);
    const type = sp ? sp.type : 'city';
    slabs.push({ x: cx, z: cz, y: 0, sx: B, sy: 0.3, sz: B, c: type === 'park' ? '#7DA35A' : '#CFC6B4' });
    const ix0 = x0 + SIDEWALK, ix1 = x1 - SIDEWALK, iz0 = z0 + SIDEWALK, iz1 = z1 - SIDEWALK;
    if (type === 'city' || type === 'police' || type === 'ucad' || type === 'resto' || type === 'phare') {
      // lots
      const pal = PAL[dist] || PAL.default; const [h0, h1] = HEIGHT[dist] || [6, 16];
      const lots = [];
      const r0 = rnd();
      const mx = lerp(ix0, ix1, 0.35 + rnd() * 0.3), mz = lerp(iz0, iz1, 0.35 + rnd() * 0.3);
      if (r0 < 0.18) lots.push([ix0, iz0, ix1, iz1]);
      else if (r0 < 0.42) { lots.push([ix0, iz0, mx, iz1], [mx, iz0, ix1, iz1]); }
      else if (r0 < 0.62) { lots.push([ix0, iz0, ix1, mz], [ix0, mz, ix1, iz1]); }
      else { lots.push([ix0, iz0, mx, mz], [mx, iz0, ix1, mz], [ix0, mz, mx, iz1], [mx, mz, ix1, iz1]); }
      for (const [a0, b0, a1, b1] of lots) {
        const g = 1.2; const w = a1 - a0 - g * 2, d = b1 - b0 - g * 2;
        let h = lerp(h0, h1, Math.pow(rnd(), 1.6));
        if (type === 'police') h = 9; if (type === 'ucad') h = 12; if (type === 'resto') h = 5;
        const c = type === 'police' ? '#E9EEF5' : type === 'ucad' ? '#D9A066' : pick(pal, rnd);
        buildings.push({ x: (a0 + a1) / 2, z: (b0 + b1) / 2, y: 0.3, sx: w, sy: h, sz: d, c });
        // roof details: parapet strip & water tanks
        roofs.push({ x: (a0 + a1) / 2, z: (b0 + b1) / 2, y: 0.3 + h, sx: w + 0.3, sy: 0.6, sz: d + 0.3, c: colorTmp.set(c).multiplyScalar(0.86).getStyle() });
        if (rnd() < 0.6) misc.push({ x: a0 + g + 2 + rnd() * (w - 4), z: b0 + g + 2 + rnd() * (d - 4), y: 0.9 + h, sx: 1.6, sy: 1.4, sz: 1.6, c: pick(['#2E4A7A', '#E8E8E8', '#3B3B3B'], rnd) });
      }
      addSolid(i, j, ix0, iz0, ix1, iz1);
      if (type === 'police') { misc.push({ x: cx, z: iz1 + 0.2, y: 6, sx: 12, sy: 1.6, sz: 0.4, c: '#1A4C9C' }); }
      if (type === 'phare') { // hill + lighthouse
        const hill = new THREE.Mesh(new THREE.CylinderGeometry(14, 24, 10, 20), MAT.grass); hill.position.set(cx - 8, 5, cz); hill.castShadow = hill.receiveShadow = true; scene.add(hill);
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 16, 14), MAT.white); tw.position.set(cx - 8, 18, cz); tw.castShadow = true; scene.add(tw);
        const lt = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2.4, 14), MAT.lamp); lt.position.set(cx - 8, 27, cz); scene.add(lt);
      }
    } else if (type === 'park') {
      for (let k = 0; k < 6; k++) {
        const x = lerp(ix0 + 6, ix1 - 6, rnd()), z = lerp(iz0 + 6, iz1 - 6, rnd()), s = 0.8 + rnd() * 0.6;
        trunks.push({ x, z, y: 0.3, sx: 2.6 * s, sy: 7 * s, sz: 2.6 * s });
        crowns.push({ x, z, y: 7 * s, sx: 9 * s, sy: 3.5 * s, sz: 9 * s });
        roundSolids.push({ x, z, r: 1.4 * s });
      }
    } else if (type === 'plaza') {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 1.2, 24), MAT.white); f.position.set(cx, 0.9, cz); f.castShadow = f.receiveShadow = true; scene.add(f);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 5.3, 0.2, 24), MAT.sea); w.position.set(cx, 1.45, cz); scene.add(w);
      roundSolids.push({ x: cx, z: cz, r: 6.5 });
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; palms.push({ x: cx + Math.cos(a) * 18, z: cz + Math.sin(a) * 18 }); }
      // ministries around
      buildings.push({ x: cx, z: iz0 + 3, y: 0.3, sx: ix1 - ix0, sy: 14, sz: 6, c: '#F2EFE8' });
      addSolid(i, j, ix0, iz0, ix1, iz0 + 6);
    } else if (type === 'market') {
      for (let a = ix0 + 2; a < ix1 - 2; a += 4.4) for (let b = iz0 + 2; b < iz1 - 2; b += 4.4) {
        stalls.push({ x: a + 1.8, z: b + 1.8, y: 0.3, sx: 3.6, sy: 2.4, sz: 3.6, c: pick(['#C98C5A', '#D9B77E', '#9C7B5B'], rnd) });
        awnings.push({ x: a + 1.8, z: b + 1.8, y: 2.7, sx: 4.2, sy: 0.25, sz: 4.2, c: pick(['#E63946', '#F2B300', '#1C9E5B', '#1A4C9C', '#FF4F9A', '#F77F00', '#22D3C5'], rnd) });
      }
      if (sp.name === 'Marché Sandaga') buildings.push({ x: cx, z: iz0 + 5, y: 0.3, sx: 26, sy: 12, sz: 9, c: '#D9A066' });
      addSolid(i, j, ix0, iz0, ix1, iz1);
    } else if (type === 'mosque') {
      buildings.push({ x: cx, z: cz, y: 0.3, sx: 34, sy: 11, sz: 34, c: '#F4F1EA' });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.green); dome.position.set(cx, 11.3, cz); dome.castShadow = true; scene.add(dome);
      const min = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 40, 12), MAT.white); min.position.set(ix1 - 3, 20.3, iz1 - 3); min.castShadow = true; scene.add(min);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 12), MAT.green); cap.position.set(ix1 - 3, 42.8, iz1 - 3); scene.add(cap);
      addSolid(i, j, cx - 17, cz - 17, cx + 17, cz + 17); roundSolids.push({ x: ix1 - 3, z: iz1 - 3, r: 2.2 });
    } else if (type === 'stadium') {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(23, 24, 13, 40, 1, true), lam('#D6D2C8', { side: THREE.DoubleSide })); ring.position.set(cx, 6.8, cz); ring.castShadow = ring.receiveShadow = true; scene.add(ring);
      const roof = new THREE.Mesh(new THREE.TorusGeometry(22, 1.4, 6, 40), lam('#1A4C9C')); roof.rotation.x = Math.PI / 2; roof.position.set(cx, 13.4, cz); scene.add(roof);
      const field = new THREE.Mesh(new THREE.CircleGeometry(22.5, 40), MAT.grass); field.rotation.x = -Math.PI / 2; field.position.set(cx, 0.35, cz); scene.add(field);
      addSolid(i, j, cx - 22, cz - 22, cx + 22, cz + 22);
    } else if (type === 'monument') {
      const hill = new THREE.Mesh(new THREE.CylinderGeometry(12, 23, 14, 24), lam('#9C8A62')); hill.position.set(cx, 7, cz); hill.castShadow = hill.receiveShadow = true; scene.add(hill);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 4, 16), MAT.white); ped.position.set(cx, 16, cz); scene.add(ped);
      const g = new THREE.Group(); g.position.set(cx, 18, cz); g.rotation.y = -0.6;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3.4, 22, 10), MAT.bronze); body.position.y = 11; body.rotation.z = 0.08;
      const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), MAT.bronze); head.position.set(0.9, 23.5, 0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 13, 8), MAT.bronze); arm.position.set(-3.4, 22, 0); arm.rotation.z = 0.65;
      const fig2 = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 17, 10), MAT.bronze); fig2.position.set(3.4, 8.5, 1.2); fig2.rotation.z = -0.12;
      const child = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 7, 8), MAT.bronze); child.position.set(-5.2, 28, 0); child.rotation.z = 0.5;
      g.add(body, head, arm, fig2, child); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
      roundSolids.push({ x: cx, z: cz, r: 21 });
    } else if (type === 'gare') {
      buildings.push({ x: cx, z: iz0 + 5, y: 0.3, sx: ix1 - ix0, sy: 6, sz: 10, c: '#C98C5A' });
      awnings.push({ x: cx, z: iz0 + 14, y: 4.8, sx: ix1 - ix0, sy: 0.3, sz: 8, c: '#1A4C9C' });
      addSolid(i, j, ix0, iz0, ix1, iz0 + 10);
    } else if (type === 'arena') {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(21, 22, 8, 36, 1, true), lam('#E8D3A2', { side: THREE.DoubleSide })); ring.position.set(cx, 4.3, cz); ring.castShadow = true; scene.add(ring);
      const sandC = new THREE.Mesh(new THREE.CircleGeometry(20.5, 36), MAT.sand); sandC.rotation.x = -Math.PI / 2; sandC.position.set(cx, 0.36, cz); scene.add(sandC);
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; awnings.push({ x: cx + Math.cos(a) * 22.3, z: cz + Math.sin(a) * 22.3, y: 6, sx: 0.4, sy: 3, sz: 4, ry: -a, c: pick(['#E63946', '#F2B300', '#1C9E5B', '#1A4C9C'], rnd) }); }
      addSolid(i, j, cx - 21, cz - 21, cx + 21, cz + 21);
    }
    // sidewalk trees & lamps at block corners
    for (const [lx, lz] of [[x0 + 1.4, z0 + 1.4], [x1 - 1.4, z0 + 1.4], [x0 + 1.4, z1 - 1.4], [x1 - 1.4, z1 - 1.4]]) {
      lamps.push({ x: lx, z: lz, y: 0.3, sx: 0.28, sy: 7, sz: 0.28 });
      lampHeads.push({ x: lx, z: lz, y: 7.2, sx: 0.9, sy: 0.35, sz: 0.9 });
    }
    if (type === 'city' && rnd() < 0.45) {
      const lx = cx + (rnd() - 0.5) * 30, lz = z1 - 1.8;
      trunks.push({ x: lx, z: lz, y: 0.3, sx: 0.6, sy: 3.4, sz: 0.6 }); crowns.push({ x: lx, z: lz, y: 3.2, sx: 3.6, sy: 2.6, sz: 3.6 });
    }
  }
  // road markings (dashed centre lines) and crosswalks
  for (let k = 0; k <= N; k++) for (let s = 0; s < N; s++) {
    const a = bMin(s), b = bMax(s);
    for (let t = a + 3; t < b - 2; t += 7) {
      lines.push({ x: roadC(k), z: t + 1.75, y: 0.02, sx: 0.35, sy: 0.02, sz: 3.5 });
      lines.push({ x: t + 1.75, z: roadC(k), y: 0.02, sx: 3.5, sy: 0.02, sz: 0.35 });
    }
  }
  for (let k = 0; k <= N; k++) for (let l = 0; l <= N; l++) {
    const x = roadC(k), z = roadC(l);
    for (let q = -3; q <= 3; q++) {
      if (l > 0) whites.push({ x: x + q * 2, z: z - R / 2 - 1.2, y: 0.02, sx: 1, sy: 0.02, sz: 2.2 });
      if (k > 0) whites.push({ x: x - R / 2 - 1.2, z: z + q * 2, y: 0.02, sx: 2.2, sy: 0.02, sz: 1 });
    }
  }
  // corniche palms & yoff pirogues
  for (let z = ZMIN + 20; z < ZMAX - 10; z += 22) palms.push({ x: CITY0 - 6, z });
  for (let x = CITY0 + 10; x < CITY1; x += 26) palms.push({ x, z: CITY0 - 6 });
  for (let x = CITY0 + 30; x < CITY1 - 30; x += 30) palms.push({ x, z: CITY1 + 6 });
  for (let k = 0; k < 14; k++) {
    const x = roadC(3) + k * 13 + rnd() * 4, z = ZMIN + 8 + rnd() * 6, c = pick(['#E63946', '#1C9E5B', '#F2B300', '#1A4C9C'], rnd);
    darks.push({ x, z, y: -0.1, sx: 2.2, sy: 1.1, sz: 11, ry: 0.15 * (rnd() - 0.5), c });
    darks.push({ x, z, y: 0.9, sx: 2.3, sy: 0.25, sz: 11.2, ry: 0, c: '#F4F1EA' });
  }
  for (const p of palms) {
    trunks.push({ x: p.x, z: p.z, y: 0, sx: 0.55, sy: 9, sz: 0.55, rz: 0.06 });
    for (let f = 0; f < 6; f++) fronds.push({ x: p.x + Math.cos(f) * 1.6, z: p.z + Math.sin(f) * 1.6, y: 8.6, sx: 4.6, sy: 0.25, sz: 1.2, ry: -f, rz: -0.35 });
    roundSolids.push({ x: p.x, z: p.z, r: 0.6 });
  }
  const bm = buildingMaterial();
  instanced(BOX, lam('#ffffff'), slabs, { colors: true, cast: false });
  instanced(BOX, bm, buildings, { colors: true });
  instanced(BOX, lam('#ffffff'), roofs, { colors: true });
  instanced(BOX, lam('#ffffff'), misc, { colors: true });
  instanced(BOX, MAT.line, lines, { cast: false });
  instanced(BOX, MAT.line, whites, { cast: false });
  instanced(BOX, MAT.pole, lamps, { receive: false });
  instanced(BOX, MAT.lamp, lampHeads, { cast: false, receive: false });
  instanced(CYL, MAT.trunk, trunks);
  instanced(new THREE.IcosahedronGeometry(0.5, 0), MAT.leaf, crowns);
  instanced(BOX, MAT.palm, fronds, { receive: false });
  instanced(BOX, lam('#ffffff'), stalls, { colors: true });
  instanced(BOX, lam('#ffffff'), awnings, { colors: true });
  instanced(BOX, lam('#ffffff'), darks, { colors: true });
}

// ---------------------------------------------------------------- vehicles
const TYPES = {
  taxi: { name: 'Taxi', len: 4.3, wid: 1.85, h: 0.75, cab: 0.72, body: '#F2B300', accel: 12, max: 30, brake: 22, steer: 2.3, grip: 7, mass: 1, hp: 100 },
  sedan: { name: 'Berline', len: 4.5, wid: 1.9, h: 0.75, cab: 0.72, body: null, accel: 13, max: 33, brake: 24, steer: 2.2, grip: 7, mass: 1, hp: 100 },
  suv: { name: '4x4', len: 4.8, wid: 2.05, h: 1.0, cab: 0.85, body: null, accel: 12, max: 31, brake: 22, steer: 2.0, grip: 6.5, mass: 1.5, hp: 140 },
  carrapide: { name: 'Car rapide', len: 7.6, wid: 2.35, h: 1.5, cab: 0.9, body: '#F2B300', accel: 7.5, max: 21, brake: 16, steer: 1.6, grip: 6, mass: 2.6, hp: 180 },
  moto: { name: 'Jakarta', len: 2.0, wid: 0.75, h: 0.5, cab: 0, body: '#C0283F', accel: 17, max: 34, brake: 26, steer: 3.0, grip: 9, mass: 0.4, hp: 60 },
  sport: { name: 'Sportive', len: 4.4, wid: 1.95, h: 0.6, cab: 0.55, body: '#FF4F9A', accel: 21, max: 47, brake: 28, steer: 2.4, grip: 7.5, mass: 1, hp: 90 },
  police: { name: 'Police', len: 4.6, wid: 1.95, h: 0.8, cab: 0.75, body: '#F4F4F4', accel: 15, max: 37, brake: 26, steer: 2.3, grip: 7.5, mass: 1.2, hp: 160 },
};
const SEDAN_COLORS = ['#F4F4F4', '#C9CCD1', '#2B2F36', '#7A1E2B', '#1F4E79', '#3C6E47', '#B8B0A0', '#4A4A4A'];
const vehicles = [];
function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; }
function makeVehicle(type, x, z, h, opts = {}) {
  const T = TYPES[type];
  const g = new THREE.Group();
  const bodyCol = T.body || pick(SEDAN_COLORS);
  const bodyMat = lam(bodyCol);
  const visual = new THREE.Group(); g.add(visual);
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12); wheelGeo.rotateZ(Math.PI / 2);
  if (type === 'moto') {
    visual.add(box(0.35, 0.45, 1.5, bodyMat, 0, 0.75, 0));
    visual.add(box(0.5, 0.18, 0.8, MAT.black, 0, 1.05, -0.2));
    visual.add(box(0.7, 0.08, 0.08, MAT.black, 0, 1.25, 0.55));
    for (const zz of [0.72, -0.72]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.14, 12).rotateZ(Math.PI / 2), MAT.black); w.position.set(0, 0.38, zz); visual.add(w); wheels.push(w); }
    visual.add(box(0.22, 0.16, 0.06, MAT.head, 0, 0.95, 0.78));
  } else {
    const yb = 0.45;
    visual.add(box(T.wid, T.h, T.len, bodyMat, 0, yb + T.h / 2, 0));
    if (type === 'carrapide') {
      visual.add(box(T.wid + 0.02, 0.55, T.len - 0.2, lam('#1A4C9C'), 0, yb + T.h + 0.3, -0.1));
      visual.add(box(T.wid + 0.04, 0.5, T.len * 0.75, MAT.glass, 0, yb + T.h - 0.3, -0.4));
      visual.add(box(T.wid + 0.04, 0.18, T.len + 0.02, lam('#D63A2F'), 0, yb + 0.45, 0));
      visual.add(box(T.wid + 0.04, 0.1, T.len + 0.02, lam('#1C9E5B'), 0, yb + 0.25, 0));
      visual.add(box(T.wid - 0.3, 0.1, T.len - 1.2, MAT.black, 0, yb + T.h + 0.65, -0.3)); // roof rack
      for (let k = 0; k < 4; k++) visual.add(box(0.06, 1.2, 0.06, MAT.black, -0.5 + k * 0.33, yb + T.h - 0.1, -T.len / 2 - 0.12));
      visual.add(box(T.wid - 0.2, 0.6, 0.12, MAT.glass, 0, yb + T.h - 0.05, T.len / 2 + 0.01));
    } else {
      const cab = box(T.wid * 0.86, T.cab, T.len * 0.48, type === 'police' ? MAT.white : bodyMat, 0, yb + T.h + T.cab / 2, -T.len * 0.05);
      visual.add(cab);
      visual.add(box(T.wid * 0.88, T.cab * 0.7, T.len * 0.5, MAT.glass, 0, yb + T.h + T.cab * 0.42, -T.len * 0.05));
      if (type === 'taxi') { visual.add(box(T.wid + 0.02, 0.22, T.len + 0.02, MAT.black, 0, yb + 0.25, 0)); visual.add(box(0.7, 0.28, 0.4, lam('#ffffff', { emissive: '#ffd27a', emissiveIntensity: 0.4 }), 0, yb + T.h + T.cab + 0.14, -0.1)); }
      if (type === 'police') {
        visual.add(box(T.wid + 0.02, 0.5, T.len + 0.02, lam('#1A3A7A'), 0, yb + 0.35, 0));
        const lr = lam('#ff2a2a', { emissive: '#ff2a2a', emissiveIntensity: 1 }), lb = lam('#2a6bff', { emissive: '#2a6bff', emissiveIntensity: 1 });
        const a = box(0.6, 0.22, 0.35, lr, -0.35, yb + T.h + T.cab + 0.11, -0.1), b2 = box(0.6, 0.22, 0.35, lb, 0.35, yb + T.h + T.cab + 0.11, -0.1);
        visual.add(a, b2); g.userData.siren = [lr, lb];
      }
      if (type === 'sport') visual.add(box(T.wid, 0.08, 0.5, MAT.black, 0, yb + T.h + 0.3, -T.len / 2 + 0.25));
    }
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const w = new THREE.Mesh(wheelGeo, MAT.black); w.position.set(sx * (T.wid / 2 - 0.05), 0.42, sz * T.len * 0.33); w.castShadow = true; visual.add(w); wheels.push(w);
    }
    visual.add(box(0.36, 0.2, 0.06, MAT.head, -T.wid / 2 + 0.3, yb + T.h * 0.6, T.len / 2 + 0.01), box(0.36, 0.2, 0.06, MAT.head, T.wid / 2 - 0.3, yb + T.h * 0.6, T.len / 2 + 0.01));
    visual.add(box(0.32, 0.18, 0.06, MAT.tail, -T.wid / 2 + 0.28, yb + T.h * 0.6, -T.len / 2 - 0.01), box(0.32, 0.18, 0.06, MAT.tail, T.wid / 2 - 0.28, yb + T.h * 0.6, -T.len / 2 - 0.01));
  }
  // AI driver head (hidden when empty)
  const driver = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), MAT.skin);
  driver.position.set(type === 'moto' ? 0 : -0.4, type === 'moto' ? 1.65 : 0.45 + T.h + 0.35, type === 'moto' ? -0.2 : 0.1);
  visual.add(driver);
  if (type === 'moto') { const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.8, 8), lam(pick(['#E63946', '#1C9E5B', '#F2B300', '#22D3C5']))); rb.position.set(0, 1.2, -0.2); visual.add(rb); g.userData.rider = rb; }
  mergeByMaterial(visual, [driver, g.userData.rider]);
  wheels.length = 0;
  g.position.set(x, 0, z); g.rotation.y = h;
  scene.add(g);
  const nC = type === 'moto' ? 1 : Math.max(2, Math.round(T.len / T.wid));
  const cr = T.wid / 2 * 1.05;
  const offs = []; for (let k = 0; k < nC; k++) offs.push(nC === 1 ? 0 : lerp(-(T.len / 2 - cr), T.len / 2 - cr, k / (nC - 1)));
  const v = {
    type, T, g, visual, wheels, driver, x, z, h, vx: 0, vz: 0, vf: 0, hp: T.hp, wrecked: false,
    ai: opts.ai || null, police: type === 'police', parked: !!opts.parked, occupied: !!opts.ai, offs, cr, rad: T.len / 2,
    inp: { thr: 0, steer: 0, hand: 0 }, blocked: 0, honk: 0, smoke: null,
  };
  driver.visible = v.occupied;
  if (g.userData.rider) g.userData.rider.visible = v.occupied;
  vehicles.push(v);
  return v;
}
function mergeByMaterial(group, keep) {
  const byMat = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh || keep.includes(m)) continue;
    m.updateMatrix(); const geo = m.geometry.index ? m.geometry.clone() : m.geometry.clone(); geo.applyMatrix4(m.matrix);
    if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(geo); group.remove(m);
  }
  for (const [mat, geos] of byMat) { const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat); mesh.castShadow = true; group.add(mesh); }
}
function removeVehicle(v) { scene.remove(v.g); const k = vehicles.indexOf(v); if (k >= 0) vehicles.splice(k, 1); }

function stepVehicle(v, dt) {
  const T = v.T; let inp = v.inp;
  if (v.wrecked) inp = { thr: 0, steer: 0, hand: 1 };
  const spd0 = v.vx * Math.sin(v.h) + v.vz * Math.cos(v.h);
  const sp = Math.abs(spd0);
  const steerAmt = inp.steer * T.steer * Math.min(1, sp / 5) * (1 - Math.min(sp / T.max, 1) * 0.42) * (inp.hand ? 1.45 : 1);
  v.h -= steerAmt * Math.sign(spd0 || 1) * dt;
  const f = fwd(v.h), r = { x: -f.z, z: f.x };
  let vf = v.vx * f.x + v.vz * f.z, vr = v.vx * r.x + v.vz * r.z;
  const thr = inp.thr;
  if (thr > 0) { if (vf < -0.5) vf += T.brake * dt * thr; else if (vf < T.max) vf += T.accel * thr * dt * (1 - Math.max(0, vf) / T.max * 0.55); }
  else if (thr < 0) { if (vf > 0.5) vf -= T.brake * dt * -thr; else if (vf > -T.max * 0.33) vf -= T.accel * 0.65 * -thr * dt; }
  else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.6 * dt);
  if (inp.hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * dt);
  if (vf > T.max) vf = lerp(vf, T.max, dt * 2);
  const onSand = v.x < CITY0 || v.z < CITY0 || v.z > CITY1 || v.x > CITY1;
  if (onSand) vf *= 1 - 0.55 * dt;
  vr *= Math.exp(-(inp.hand ? 1.3 : T.grip) * dt);
  v.vx = f.x * vf + r.x * vr; v.vz = f.z * vf + r.z * vr; v.vf = vf; v.vr = vr;
  v.x += v.vx * dt; v.z += v.vz * dt;
  // building collisions (several circles along the body)
  let impact = 0;
  for (const o of v.offs) {
    const cx = v.x + f.x * o, cz = v.z + f.z * o;
    const c = pushOut(cx, cz, v.cr);
    if (c) {
      v.x += c.nx * c.d; v.z += c.nz * c.d;
      const vn = v.vx * c.nx + v.vz * c.nz;
      if (vn < 0) { v.vx -= c.nx * vn * 1.35; v.vz -= c.nz * vn * 1.35; impact = Math.max(impact, -vn); }
    }
  }
  if (impact > 7) damage(v, (impact - 7) * 3, 'mur');
  // visuals
  v.g.position.set(v.x, 0, v.z); v.g.rotation.y = v.h;
  v.visual.rotation.z = clamp(-vr * 0.02 + inp.steer * sp * 0.002, -0.08, 0.08);
  v.visual.rotation.x = clamp(-thr * 0.02 * Math.min(1, sp / 8), -0.04, 0.04);
  for (const w of v.wheels) w.rotation.x += vf * dt / 0.42;
}
function damage(v, amt, why) {
  if (v.wrecked) return;
  v.hp -= amt;
  if (v === player.car && amt > 4) shake = Math.min(1, shake + amt / 40);
  if (v.hp <= 0) {
    v.hp = 0; v.wrecked = true;
    v.visual.traverse(o => { if (o.isMesh && o.material !== MAT.black) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); } });
    if (v === player.car) { toast('Moteur HS ! Descends et trouve une autre voiture.', 'bad'); sfx.boom(); }
  }
}

// ---------------------------------------------------------------- traffic AI
const nodePos = (k, l) => ({ x: roadC(k), z: roadC(l) });
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function laneTargets(ai) {
  const [k, l] = ai.to, [dx, dz] = ai.dir, p = nodePos(k, l);
  const rx = -dz, rz = dx; // right of dir (x, z) with f=(dx,dz) → r=(-dz,dx)
  return { x: p.x + rx * LANE - dx * (R / 2 + 2), z: p.z + rz * LANE - dz * (R / 2 + 2) };
}
function chooseNext(ai) {
  const [k, l] = ai.to, [dx, dz] = ai.dir;
  const opts = DIRS.filter(([a, b]) => !(a === -dx && b === -dz) && k + a >= 0 && k + a <= N && l + b >= 0 && l + b <= N);
  let d = opts.find(([a, b]) => a === dx && b === dz);
  if (!d || R01() < 0.45) d = pick(opts.length ? opts : [[-dx, -dz]]);
  return d;
}
function setupAI(v, k, l, dir, prog = 0.5) {
  const from = [k, l], to = [k + dir[0], l + dir[1]];
  const a = nodePos(...from), b = nodePos(...to);
  const rx = -dir[1], rz = dir[0];
  v.x = lerp(a.x, b.x, prog) + rx * LANE; v.z = lerp(a.z, b.z, prog) + rz * LANE;
  v.h = Math.atan2(dir[0], dir[1]);
  v.vx = v.vz = 0;
  v.ai = { from, to, dir, wps: [], cruise: v.type === 'carrapide' ? 9 : v.type === 'moto' ? 13 : 10 + R01() * 3 };
  v.ai.wps.push(laneTargets(v.ai));
  v.occupied = true; v.driver.visible = true; if (v.g.userData.rider) v.g.userData.rider.visible = true;
  v.g.position.set(v.x, 0, v.z); v.g.rotation.y = v.h;
}
function randomEdgeNear(px, pz, dmin, dmax) {
  for (let t = 0; t < 30; t++) {
    const k = Math.floor(R01() * (N + 1)), l = Math.floor(R01() * (N + 1));
    const dir = pick(DIRS); const k2 = k + dir[0], l2 = l + dir[1];
    if (k2 < 0 || k2 > N || l2 < 0 || l2 > N) continue;
    const a = nodePos(k, l), b = nodePos(k2, l2), m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const d = Math.hypot(m.x - px, m.z - pz);
    if (d >= dmin && d <= dmax) return { k, l, dir };
  }
  return null;
}
function aiDrive(v, dt) {
  const ai = v.ai; let wp = ai.wps[0];
  if (!wp) { ai.wps.push(laneTargets(ai)); wp = ai.wps[0]; }
  let dx = wp.x - v.x, dz = wp.z - v.z, d = Math.hypot(dx, dz);
  if (d < 4.5) {
    ai.wps.shift();
    if (!ai.wps.length) {
      // reached stop line: plan turn
      const nd = chooseNext(ai);
      const n = nodePos(...ai.to); const rx = -nd[1], rz = nd[0];
      ai.from = ai.to; ai.to = [ai.to[0] + nd[0], ai.to[1] + nd[1]]; ai.dir = nd;
      ai.wps.push({ x: n.x + rx * LANE + nd[0] * (R / 2 + 1), z: n.z + rz * LANE + nd[1] * (R / 2 + 1) }, laneTargets(ai));
    }
    wp = ai.wps[0]; dx = wp.x - v.x; dz = wp.z - v.z; d = Math.hypot(dx, dz);
  }
  const want = Math.atan2(dx, dz); const diff = angDiff(v.h, want);
  v.inp.steer = clamp(-diff * 2.2, -1, 1);
  // look ahead for obstacles
  const f = fwd(v.h); let near = 99;
  const check = (x, z) => { const ox = x - v.x, oz = z - v.z, along = ox * f.x + oz * f.z; if (along <= 0 || along > 14) return; const lat = Math.abs(-ox * f.z + oz * f.x); if (lat < 2.0) near = Math.min(near, along); };
  for (const o of vehicles) if (o !== v) check(o.x, o.z);
  if (!player.car) check(player.x, player.z);
  for (const p of peds) if (p.state !== 'down') check(p.x, p.z);
  let target = ai.cruise * clamp(1 - Math.abs(diff) / 1.4, 0.35, 1);
  if (near < 14) target = Math.min(target, (near - 5) * 1.2);
  if (target < 0.5) target = 0;
  const vf = v.vx * f.x + v.vz * f.z;
  v.inp.thr = vf < target - 0.5 ? 0.8 : vf > target + 0.5 ? -0.9 : 0;
  v.inp.hand = 0;
  if (target === 0 && near < 9) { v.blocked += dt; if (v.blocked > 2.5 && player.car && Math.hypot(player.x - v.x, player.z - v.z) < 16 && v.honk <= 0) { sfx.horn(0.35, 0.25); v.honk = 4; } } else v.blocked = 0;
  v.honk -= dt;
  if (v.blocked > 7) { v.blocked = 0; v.ai.wps = [laneTargets(v.ai)]; v.x += -f.z * 1.5; v.z += f.x * 1.5; }
}

// ---------------------------------------------------------------- police
let wanted = 0, evadeT = 0, policeSpawnT = 0, bustT = 0, wantedCool = 0;
function addWanted(n, why) {
  if (wantedCool > 0 && n < 1.5) return;
  const before = Math.ceil(wanted);
  wanted = clamp(wanted + n, 0, 5); evadeT = 0; wantedCool = 1.2;
  if (Math.ceil(wanted) > before) { toast(why ? why + ' · la police te recherche' : 'La police te recherche', 'bad'); }
  renderStars();
}
function policeDrive(v, dt) {
  const tx = player.car ? player.car.x : player.x, tz = player.car ? player.car.z : player.z;
  const pvx = player.car ? player.car.vx : 0, pvz = player.car ? player.car.vz : 0;
  const dist = Math.hypot(tx - v.x, tz - v.z);
  let gx, gz;
  if (v.leaving) { // drive away
    const a = Math.atan2(v.x - tx, v.z - tz); gx = v.x + Math.sin(a) * 50; gz = v.z + Math.cos(a) * 50;
  } else if (dist < 46) { gx = tx + pvx * 0.6; gz = tz + pvz * 0.6; }
  else {
    // grid navigation: target nearest node that reduces distance
    if (!v.nav || Math.hypot(v.nav.x - v.x, v.nav.z - v.z) < 7) {
      const k = clamp(Math.round((v.x - roadC(0)) / S), 0, N), l = clamp(Math.round((v.z - roadC(0)) / S), 0, N);
      let best = null, bd = 1e9;
      for (const [a, b] of DIRS) { const k2 = k + a, l2 = l + b; if (k2 < 0 || k2 > N || l2 < 0 || l2 > N) continue; const p = nodePos(k2, l2), dd = Math.hypot(p.x - tx, p.z - tz); if (dd < bd) { bd = dd; best = p; } }
      const here = nodePos(k, l);
      v.nav = Math.hypot(here.x - v.x, here.z - v.z) > 9 ? here : best;
    }
    gx = v.nav.x; gz = v.nav.z;
  }
  const want = Math.atan2(gx - v.x, gz - v.z); const diff = angDiff(v.h, want);
  v.inp.steer = clamp(-diff * 2.6, -1, 1);
  const f = fwd(v.h); const vf = v.vx * f.x + v.vz * f.z;
  const cap = wanted >= 3 ? TYPES.police.max : TYPES.police.max * 0.82;
  const tgt = Math.abs(diff) > 1.2 ? 9 : (dist < 12 && !player.car ? 3 : cap);
  v.inp.thr = vf < tgt ? 1 : -0.6; v.inp.hand = Math.abs(diff) > 1.4 && vf > 10 ? 1 : 0;
  if (Math.abs(vf) < 1 && v.inp.thr > 0) { v.stuck = (v.stuck || 0) + dt; if (v.stuck > 1.5) { v.inp.thr = -1; v.inp.steer *= -1; if (v.stuck > 2.6) v.stuck = 0; } } else v.stuck = 0;
}
function spawnPolice() {
  const e = randomEdgeNear(player.x, player.z, 120, 230); if (!e) return;
  const v = makeVehicle('police', 0, 0, 0, { ai: true });
  setupAI(v, e.k, e.l, e.dir, 0.3); v.ai = null; v.occupied = true;
}
function updatePolice(dt) {
  const cops = vehicles.filter(v => v.police && !v.wrecked && v.occupied && v !== player.car);
  const want = wanted > 0 ? Math.min(4, Math.ceil(wanted)) : 0;
  policeSpawnT -= dt;
  if (cops.filter(c => !c.leaving).length < want && policeSpawnT <= 0) { spawnPolice(); policeSpawnT = 5 - Math.min(3, wanted * 0.6); }
  const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z;
  let closest = 1e9;
  for (const c of cops) {
    if (wanted <= 0) c.leaving = true;
    const d = Math.hypot(c.x - px, c.z - pz);
    if (!c.leaving) closest = Math.min(closest, d);
    if (c.leaving && d > 260) removeVehicle(c);
  }
  // remove wrecked or abandoned cop cars far away
  for (const v of vehicles.slice()) if (v.police && v.wrecked && Math.hypot(v.x - px, v.z - pz) > 220) removeVehicle(v);
  // evasion
  if (wanted > 0) {
    if (closest > 95) { evadeT += dt; if (evadeT > 5 + Math.ceil(wanted) * 2.5) { wanted = Math.ceil(wanted) - 1; evadeT = 0; renderStars(); toast(wanted <= 0 ? 'Tu as semé la police !' : 'La police perd ta trace…', 'pink'); } }
    else evadeT = 0;
  }
  // arrest
  const ps = player.car ? Math.abs(player.car.vf) : 0;
  const catchD = player.car ? 7.5 : 4.5;
  if (wanted > 0 && closest < catchD && ps < 2.5) { bustT += dt; if (bustT > (player.car ? 2.2 : 0.9)) busted(); } else bustT = Math.max(0, bustT - dt);
  $('#stars').classList.toggle('flash', wanted > 0 && closest < 95);
}

// ---------------------------------------------------------------- pedestrians
const peds = [];
const BOUBOU = ['#E63946', '#F2B300', '#1C9E5B', '#1A4C9C', '#FF4F9A', '#F77F00', '#22D3C5', '#7B3FB4', '#FFFFFF', '#E9C46A', '#2A9D8F'];
function makePersonMesh(col, hat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.46, 1.3, 8), lam(col)); body.position.y = 0.65; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), MAT.skin); head.position.y = 1.5; head.castShadow = true;
  g.add(body, head);
  if (hat) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.22, 8), lam(hat)); h.position.y = 1.7; g.add(h); }
  scene.add(g); return g;
}
function perimeter(i, j) { const x0 = bMin(i) + 2, x1 = bMax(i) - 2, z0 = bMin(j) + 2, z1 = bMax(j) - 2; return { x0, x1, z0, z1, L: 2 * (x1 - x0 + z1 - z0) }; }
function posOnPerim(P, t) {
  t = ((t % P.L) + P.L) % P.L; const w = P.x1 - P.x0, h = P.z1 - P.z0;
  if (t < w) return { x: P.x0 + t, z: P.z0 }; t -= w;
  if (t < h) return { x: P.x1, z: P.z0 + t }; t -= h;
  if (t < w) return { x: P.x1 - t, z: P.z1 }; t -= w;
  return { x: P.x0, z: P.z1 - t };
}
function tOnPerim(P, x, z) {
  const w = P.x1 - P.x0, h = P.z1 - P.z0;
  const c = [[Math.abs(z - P.z0), clamp(x - P.x0, 0, w)], [Math.abs(x - P.x1), w + clamp(z - P.z0, 0, h)], [Math.abs(z - P.z1), w + h + clamp(P.x1 - x, 0, w)], [Math.abs(x - P.x0), 2 * w + h + clamp(P.z1 - z, 0, h)]];
  c.sort((a, b) => a[0] - b[0]); return c[0][1];
}
function placePed(p, nearX, nearZ) {
  for (let t = 0; t < 20; t++) {
    const rand = nearX === undefined;
    const i = rand ? Math.floor(R01() * N) : blockIdx(nearX + (R01() - 0.5) * 300), j = rand ? Math.floor(R01() * N) : blockIdx(nearZ + (R01() - 0.5) * 300);
    const P = perimeter(i, j); const tt = R01() * P.L; const q = posOnPerim(P, tt);
    const d = Math.hypot(q.x - nearX, q.z - nearZ);
    if (nearX === undefined || (d > 60 && d < 190) || t === 19) { p.P = P; p.t = tt; p.x = q.x; p.z = q.z; p.state = 'walk'; p.mesh.rotation.set(0, 0, 0); return; }
  }
}
function makePed(x, z) {
  const p = { mesh: makePersonMesh(pick(BOUBOU), R01() < 0.4 ? pick(BOUBOU) : null), dir: R01() < 0.5 ? 1 : -1, speed: 1.1 + R01() * 0.6, state: 'walk', timer: 0, vx: 0, vz: 0, x: 0, z: 0, ph: R01() * 6 };
  placePed(p, x, z); peds.push(p);
  if (peds.length > 70) { const o = peds.shift(); scene.remove(o.mesh); }
  return p;
}
function updatePed(p, dt) {
  if (p.state === 'walk') {
    p.t += p.dir * p.speed * dt; const q = posOnPerim(p.P, p.t);
    const hx = q.x - p.x, hz = q.z - p.z; if (hx || hz) p.mesh.rotation.y = Math.atan2(hx, hz);
    p.x = q.x; p.z = q.z; p.ph += dt * p.speed * 6;
    p.mesh.position.set(p.x, 0.3 + Math.abs(Math.sin(p.ph)) * 0.06, p.z);
  } else if (p.state === 'down') {
    p.timer -= dt; p.vx *= Math.exp(-3 * dt); p.vz *= Math.exp(-3 * dt);
    p.x += p.vx * dt; p.z += p.vz * dt; const c = pushOut(p.x, p.z, 0.4); if (c) { p.x += c.nx * c.d; p.z += c.nz * c.d; }
    p.mesh.position.set(p.x, 0.25, p.z);
    if (p.timer <= 0) { p.state = 'flee'; p.timer = 4; p.mesh.rotation.x = 0; }
  } else { // dodge / flee: free movement then rejoin sidewalk
    p.timer -= dt;
    if (p.state === 'flee') { const a = Math.atan2(p.x - (player.car ? player.car.x : player.x), p.z - (player.car ? player.car.z : player.z)); p.vx = Math.sin(a) * 4.5; p.vz = Math.cos(a) * 4.5; }
    p.x += p.vx * dt; p.z += p.vz * dt; p.ph += dt * 12;
    const c = pushOut(p.x, p.z, 0.4); if (c) { p.x += c.nx * c.d; p.z += c.nz * c.d; }
    p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
    p.mesh.position.set(p.x, 0.3 + Math.abs(Math.sin(p.ph)) * 0.12, p.z);
    if (p.timer <= 0) {
      const i = blockIdx(p.x), j = blockIdx(p.z); p.P = perimeter(i, j); p.t = tOnPerim(p.P, p.x, p.z);
      const q = posOnPerim(p.P, p.t); p.x = q.x; p.z = q.z; p.state = 'walk';
    }
  }
}
function knockPed(p, v, sp) {
  p.state = 'down'; p.timer = 2.6; p.vx = v.vx * 0.7; p.vz = v.vz * 0.7;
  p.mesh.rotation.x = -Math.PI / 2; p.mesh.rotation.y = Math.atan2(v.vx, v.vz);
  if (v === player.car) { addWanted(1, 'Piéton renversé'); sfx.thud(); }
}
function pedVsCars(p) {
  if (p.state === 'down') return;
  for (const v of vehicles) {
    const sp = Math.hypot(v.vx, v.vz); if (sp < 3) continue;
    const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz);
    if (d > 9) continue;
    const dirx = v.vx / sp, dirz = v.vz / sp;
    const along = dx * dirx + dz * dirz, lat = -dx * dirz + dz * dirx;
    if (d < v.rad + 0.3 && Math.abs(lat) < v.T.wid / 2 + 0.4 && along > -v.rad) { knockPed(p, v, sp); return; }
    if (p.state === 'walk' && along > 0 && along < 8 && Math.abs(lat) < 2.4 && sp > 6 && R01() < 0.75) {
      const s = lat >= 0 ? 1 : -1; p.state = 'dodge'; p.timer = 0.7; p.vx = -dirz * s * 6.5; p.vz = dirx * s * 6.5;
    }
  }
}

// ---------------------------------------------------------------- player
const save = loadSave();
const player = {
  x: roadC(1) + 9, z: roadC(9) - 2, h: Math.PI, vx: 0, vz: 0, car: null, hp: 100,
  mesh: makePersonMesh(save.color || '#22D3C5', '#111111'), ph: 0, down: 0,
};
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem('dakarlife.save.v1')); if (s && s.v === 1) return { shared: s, money: s.money, color: s.color, name: s.name }; } catch (e) {}
  try { const r = JSON.parse(localStorage.getItem('dakarlife.rue.v1')); if (r) return { money: r.money, color: '#22D3C5' }; } catch (e) {}
  return { money: 25000, color: '#22D3C5' };
}
let money = Math.max(0, Math.round(save.money ?? 25000)), lastSaved = money, saveT = 0;
function persist() {
  if (money === lastSaved) return;
  try {
    const s = JSON.parse(localStorage.getItem('dakarlife.save.v1'));
    if (s && s.v === 1) { s.money = money; localStorage.setItem('dakarlife.save.v1', JSON.stringify(s)); }
    else localStorage.setItem('dakarlife.rue.v1', JSON.stringify({ money }));
    lastSaved = money;
  } catch (e) {}
}
function addMoney(n) { money = Math.max(0, Math.round(money + n)); $('#money').textContent = fmt(money); }

// ---------------------------------------------------------------- input
const keys = new Set();
const touchIn = { x: 0, y: 0, active: false };
const btn = { hand: false, sprint: false };
addEventListener('keydown', e => {
  if (!started) return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (e.repeat) return;
  if (k === 'e' || k === 'f') toggleCar();
  if (k === 'h') sfx.horn(0.5);
  if (k === 'c') cycleCam();
  if (k === 'r') radio.toggle();
  if (k === 'm') setSound(!soundOn);
  if (k === 'escape' || k === 'p') setPaused(!paused);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
function axis() {
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('q') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('z') || keys.has('arrowup')) y += 1;
  if (keys.has('s') || keys.has('arrowdown')) y -= 1;
  if (touchIn.active) { x += touchIn.x; y += touchIn.y; }
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
}
// mouse / touch camera drag
let camYaw = Math.PI, camPitch = 0.32, dragId = null, dragX = 0, dragY = 0;
canvas.addEventListener('pointerdown', e => { if (TOUCH) return; dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (e.pointerId !== dragId) return; camYaw -= (e.clientX - dragX) * 0.006; camPitch = clamp(camPitch + (e.clientY - dragY) * 0.004, 0.08, 1.1); dragX = e.clientX; dragY = e.clientY; manualCam = 1.5; });
canvas.addEventListener('pointerup', e => { if (e.pointerId === dragId) dragId = null; });
let manualCam = 0;
function setupTouch() {
  const zone = $('#zone'), stick = $('#stick'), knob = stick.firstElementChild;
  let id = null, ox = 0, oy = 0;
  zone.addEventListener('pointerdown', e => { id = e.pointerId; ox = e.clientX; oy = e.clientY; stick.hidden = false; stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; knob.style.transform = ''; touchIn.active = true; zone.setPointerCapture(id); e.preventDefault(); });
  zone.addEventListener('pointermove', e => { if (e.pointerId !== id) return; let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy), m = 50; if (d > m) { dx = dx / d * m; dy = dy / d * m; } knob.style.transform = `translate(${dx}px,${dy}px)`; touchIn.x = dx / m; touchIn.y = -dy / m; });
  const end = e => { if (e.pointerId !== id) return; id = null; stick.hidden = true; touchIn.active = false; touchIn.x = touchIn.y = 0; };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  const cz = $('#camzone'); let cid = null, cx = 0, cy = 0;
  cz.addEventListener('pointerdown', e => { cid = e.pointerId; cx = e.clientX; cy = e.clientY; cz.setPointerCapture(cid); });
  cz.addEventListener('pointermove', e => { if (e.pointerId !== cid) return; camYaw -= (e.clientX - cx) * 0.008; camPitch = clamp(camPitch + (e.clientY - cy) * 0.005, 0.08, 1.1); cx = e.clientX; cy = e.clientY; manualCam = 1.5; });
  const cend = e => { if (e.pointerId === cid) cid = null; }; cz.addEventListener('pointerup', cend); cz.addEventListener('pointercancel', cend);
  for (const b of document.querySelectorAll('.tb')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); if (k === 'enter') toggleCar(); else if (k === 'horn') sfx.horn(0.5); else btn[k] = true; });
    const up = () => { b.classList.remove('on'); if (k in btn) btn[k] = false; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  }
}

// ---------------------------------------------------------------- enter / exit
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const v of vehicles) {
    if (v.police && !v.wrecked && wanted > 0) continue;
    const f = fwd(v.h);
    for (const o of v.offs) { const d = Math.hypot(player.x - (v.x + f.x * o), player.z - (v.z + f.z * o)) - v.cr; if (d < bd) { bd = d; best = v; } }
  }
  return best;
}
function toggleCar() {
  if (paused || player.down > 0 || bigT > 0) return;
  audioInit();
  if (player.car) { exitCar(); return; }
  const v = nearestCar(2.6); if (!v) return;
  if (v.wrecked) { toast('Cette voiture est HS.', 'bad'); return; }
  if (v.occupied) {
    // carjack: driver flees
    const p = makePed(); const f = fwd(v.h);
    p.x = v.x - f.z * -2.2; p.z = v.z + f.x * -2.2; p.state = 'flee'; p.timer = 5; p.mesh.position.set(p.x, 0.3, p.z);
    const witness = vehicles.some(c => c.police && Math.hypot(c.x - v.x, c.z - v.z) < 130);
    if (v.police) addWanted(2, 'Voiture de police volée');
    else if (witness) addWanted(1, 'Vol de voiture');
    else toast('Le chauffeur s’enfuit en criant « Sacc ! »', 'pink');
    if (v.type === 'carrapide') toast('Tu as volé un car rapide. Ndank ndank !', 'pink');
  }
  v.ai = null; v.parked = false; v.occupied = true; v.driver.visible = false; if (v.g.userData.rider) v.g.userData.rider.visible = false;
  v.inp = { thr: 0, steer: 0, hand: 0 };
  player.car = v; player.mesh.visible = false;
  camYaw = v.h; $('#carname').textContent = v.T.name;
  sfx.door(); radio.autoOn();
  if (fare.state === 'idle' && !v.police) newFare();
}
function exitCar() {
  const v = player.car; if (!v) return;
  if (Math.abs(v.vf) > 12) { toast('Ralentis avant de sauter !', 'bad'); return; }
  const f = fwd(v.h); const r = { x: -f.z, z: f.x };
  let ok = false;
  for (const s of [-1, 1]) {
    const x = v.x + r.x * s * (v.T.wid / 2 + 0.9), z = v.z + r.z * s * (v.T.wid / 2 + 0.9);
    if (!pushOut(x, z, 0.4)) { player.x = x; player.z = z; ok = true; break; }
  }
  if (!ok) { player.x = v.x - f.x * (v.rad + 1); player.z = v.z - f.z * (v.rad + 1); }
  player.car = null; player.mesh.visible = true; v.occupied = false; v.inp = { thr: 0, steer: 0, hand: 1 };
  sfx.door(); radio.autoOff();
  if (fare.state !== 'idle') { cancelFare('Ton client est descendu.'); }
}

// ---------------------------------------------------------------- fares (clando)
const fare = { state: 'idle', client: null, dest: null, t: 0, limit: 0, reward: 0 };
const beaconMat = new THREE.MeshBasicMaterial({ color: '#F2B300', transparent: true, opacity: 0.35, depthWrite: false });
const destMat = new THREE.MeshBasicMaterial({ color: '#7CF29A', transparent: true, opacity: 0.35, depthWrite: false });
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 40, 20, 1, true), beaconMat); beacon.visible = false; scene.add(beacon);
const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.25, 6, 30), new THREE.MeshBasicMaterial({ color: '#F2B300' })); ring.rotation.x = Math.PI / 2; ring.visible = false; scene.add(ring);
function newFare() {
  const v = player.car; if (!v) return;
  for (let t = 0; t < 40; t++) {
    const k = Math.floor(R01() * (N + 1)), j = Math.floor(R01() * N);
    const x = roadC(k) + (R / 2 - 1.5) * (R01() < 0.5 ? 1 : -1), z = lerp(bMin(j) + 8, bMax(j) - 8, R01());
    const d = Math.hypot(x - v.x, z - v.z);
    if (d > 70 && d < 260) {
      const c = makePersonMesh(pick(BOUBOU), pick(BOUBOU)); c.position.set(x, 0.3, z);
      fare.state = 'pickup'; fare.client = { x, z, mesh: c };
      setBeacon(x, z, beaconMat, '#F2B300'); return;
    }
  }
}
function setBeacon(x, z, mat, col) { beacon.material = mat; beacon.position.set(x, 20, z); beacon.visible = true; ring.position.set(x, 0.4, z); ring.material.color.set(col); ring.visible = true; }
function cancelFare(msg) {
  if (fare.client) scene.remove(fare.client.mesh);
  fare.state = 'idle'; fare.client = null; fare.dest = null; beacon.visible = ring.visible = false;
  if (msg) toast(msg, 'bad');
}
function updateFare(dt) {
  const v = player.car; const m = $('#mission');
  if (!v || v.police) { m.hidden = true; return; }
  if (fare.state === 'idle') { newFare(); }
  if (fare.state === 'pickup') {
    const d = Math.hypot(fare.client.x - v.x, fare.client.z - v.z);
    fare.client.mesh.rotation.y = Math.atan2(v.x - fare.client.x, v.z - fare.client.z);
    m.hidden = false; m.innerHTML = `Un client fait signe <b>${Math.round(d)} m</b><small>Arrête-toi à côté de lui pour le prendre</small>`;
    if (d < 7 && Math.abs(v.vf) < 3) {
      scene.remove(fare.client.mesh); fare.client = null;
      const cands = DESTS.filter(t => { const dd = Math.hypot(t.x - v.x, t.z - v.z); return dd > 220 && dd < 650; });
      fare.dest = pick(cands.length ? cands : DESTS);
      const dist = Math.hypot(fare.dest.x - v.x, fare.dest.z - v.z) * 1.25;
      const mult = v.type === 'carrapide' ? 2 : v.type === 'taxi' ? 1.3 : 1;
      fare.reward = Math.round((1000 + dist * 7) * mult / 100) * 100;
      fare.limit = dist / 13 + 22; fare.t = 0; fare.mult = mult;
      fare.state = 'ride'; setBeacon(fare.dest.x, fare.dest.z, destMat, '#7CF29A'); sfx.door();
      toast(v.type === 'carrapide' ? `Le car se remplit : direction ${fare.dest.name} !` : `« ${fare.dest.name}, s’il te plaît. On est pressés ! »`, 'pink');
    }
  } else if (fare.state === 'ride') {
    fare.t += dt;
    const d = Math.hypot(fare.dest.x - v.x, fare.dest.z - v.z), left = Math.max(0, fare.limit - fare.t);
    m.hidden = false; m.innerHTML = `Course vers <b>${fare.dest.name}</b> · ${Math.round(d)} m<small>${fmt(fare.reward)} · bonus si tu arrives en ${Math.ceil(left)} s</small>`;
    if (d < 10 && Math.abs(v.vf) < 3.5) {
      const bonus = left > 0 ? Math.round(fare.reward * 0.5 / 100) * 100 : 0;
      addMoney(fare.reward + bonus); sfx.cash(); big('+' + fmt(fare.reward + bonus), 'paid');
      toast(bonus ? `Course payée + bonus rapidité ${fmt(bonus)}` : 'Course payée. Jërëjëf !', 'money');
      fare.state = 'idle'; beacon.visible = ring.visible = false; persist();
    }
  }
}

// ---------------------------------------------------------------- busted / wasted
let bigT = 0;
function big(text, cls) { $('#big').innerHTML = `<div class="${cls} stroke">${text}</div>`; bigT = 2.2; }
const COMMISSARIAT = { x: (bMin(3) + bMax(3)) / 2, z: roadC(2) - 5.5 };
function busted() {
  const fine = Math.min(money, 3000 * Math.ceil(wanted) + Math.round(money * 0.05));
  addMoney(-fine); big('Arrêté', 'busted'); toast(`Amende : ${fmt(fine)}. Libéré au commissariat de Yoff.`, 'bad');
  if (player.car) { const v = player.car; v.occupied = false; v.vx = v.vz = 0; v.inp = { thr: 0, steer: 0, hand: 1 }; player.car = null; player.mesh.visible = true; radio.autoOff(); }
  cancelFare(); wanted = 0; evadeT = 0; bustT = 0; renderStars();
  for (const v of vehicles.slice()) if (v.police) removeVehicle(v);
  player.x = COMMISSARIAT.x; player.z = COMMISSARIAT.z; persist(); sfx.boom();
}
function wasted() {
  const bill = Math.min(money, 5000);
  addMoney(-bill); big('Hôpital', 'wasted'); toast(`Soins à l’Hôpital Principal : ${fmt(bill)}.`, 'bad');
  player.hp = 100; wanted = 0; renderStars(); for (const v of vehicles.slice()) if (v.police) removeVehicle(v);
  player.x = roadC(2) + 6; player.z = roadC(10) - 5.5; player.down = 0; player.mesh.rotation.x = 0; persist();
}

// ---------------------------------------------------------------- audio
let soundOn = true, AC = null, master = null;
const sfx = {
  engine: null,
  init() {
    if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = AC.createGain(); master.gain.value = soundOn ? 0.55 : 0; master.connect(AC.destination);
    const o1 = AC.createOscillator(), o2 = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = -1200; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
    const sir = AC.createOscillator(), sg = AC.createGain(); sir.type = 'triangle'; sg.gain.value = 0; sir.connect(sg); sg.connect(master); sir.start();
    this.engine = { o1, o2, f, g, sir, sg };
  },
  update(sp, max, on, siren) {
    if (!this.engine) return; const t = AC.currentTime, e = this.engine;
    const r = sp / max; const fr = 55 + r * 140 + (r > 0.5 ? 20 : 0);
    e.o1.frequency.setTargetAtTime(fr, t, 0.08); e.o2.frequency.setTargetAtTime(fr, t, 0.08); e.f.frequency.setTargetAtTime(400 + r * 1400, t, 0.1);
    e.g.gain.setTargetAtTime(on ? 0.05 + r * 0.06 : 0, t, 0.15);
    e.sir.frequency.setTargetAtTime(siren ? 750 + Math.sin(t * 5) * 280 : 600, t, 0.05); e.sg.gain.setTargetAtTime(siren ? siren * 0.05 : 0, t, 0.2);
  },
  tone(type, f0, f1, dur, vol) { if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); },
  horn(dur = 0.5, vol = 0.18) { if (!AC) return; this.tone('square', 415, 410, dur, vol); this.tone('square', 523, 520, dur, vol * 0.8); },
  door() { this.tone('square', 180, 60, 0.12, 0.12); },
  thud() { this.tone('sine', 140, 40, 0.25, 0.4); },
  cash() { this.tone('triangle', 988, 990, 0.12, 0.15); setTimeout(() => this.tone('triangle', 1319, 1320, 0.25, 0.15), 110); },
  boom() { this.tone('sawtooth', 120, 30, 0.6, 0.3); },
  crash(v) { this.tone('square', 90 + R01() * 60, 30, 0.2, Math.min(0.35, v)); },
};
function audioInit() { sfx.init(); if (AC && AC.state === 'suspended') AC.resume(); }
function setSound(on) { soundOn = on; if (master) master.gain.value = on ? 0.55 : 0; $('#m-sound').textContent = 'Son : ' + (on ? 'activé' : 'coupé'); }
// procedural sabar-style radio
const radio = {
  on: false, user: null, step: 0, next: 0, timer: null, noise: null,
  toggle() { audioInit(); this.user = !this.on; this.user ? this.start() : this.stop(); toast(this.on ? 'Radio Ndank Ndank FM · sabar non-stop' : 'Radio coupée'); },
  autoOn() { if (this.user === false) return; this.start(); },
  autoOff() { if (!this.user) this.stop(); },
  start() {
    if (!AC || this.on) return; this.on = true;
    if (!this.noise) { const b = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R01() * 2 - 1; this.noise = b; }
    this.next = AC.currentTime + 0.05; this.timer = setInterval(() => this.tick(), 60);
  },
  stop() { this.on = false; clearInterval(this.timer); },
  hit(t, kind) {
    const g = AC.createGain(); g.connect(master);
    if (kind === 'bass') { const o = AC.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(g); o.start(t); o.stop(t + 0.25); return; }
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(); s.buffer = this.noise;
    f.type = kind === 'shk' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'slap' ? 1700 : kind === 'tom' ? 420 : 6000; f.Q.value = kind === 'slap' ? 3 : 1;
    const v = kind === 'slap' ? 0.28 : kind === 'tom' ? 0.3 : 0.05, d = kind === 'shk' ? 0.04 : 0.09;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); s.connect(f); f.connect(g); s.start(t); s.stop(t + d + 0.02);
  },
  tick() {
    const spb = 60 / 118 / 4; const P = { bass: [0, 6, 10], slap: [4, 7, 12, 14, 15], tom: [3, 9, 11], shk: [0, 2, 4, 6, 8, 10, 12, 14] };
    while (this.next < AC.currentTime + 0.25) {
      const s = this.step % 16;
      for (const k in P) if (P[k].includes(s)) this.hit(this.next, k);
      if (this.step % 32 >= 28 && s % 2 === 1) this.hit(this.next, 'slap');
      this.next += spb; this.step++;
    }
  },
};

// ---------------------------------------------------------------- HUD
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5 6 20.8l1.3-6.7-5-4.6 6.8-.8z"/></svg>';
function renderStars() { const n = Math.ceil(wanted); $('#stars').innerHTML = [0, 1, 2, 3, 4].map(i => `<span class="${i < n ? 'on' : ''}">${STAR}</span>`).join(''); }
function toast(t, cls = '') {
  const box = $('#toasts'), el = document.createElement('div'); el.className = 'toast ' + cls; el.textContent = t; box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => el.remove(), 3200);
}
let lastDistrict = '', distT = 0;
function showDistrict(name) { const el = $('#district'); el.textContent = name; el.classList.add('show'); distT = 3; }
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
let gameHour = 16.5, gameDay = 0;
const mini = $('#mini'), mctx = mini.getContext('2d');
function drawMini() {
  const w = mini.width, c = w / 2, sc = w / 360; // ~180m radius
  const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z;
  const rot = camYaw;
  mctx.save(); mctx.clearRect(0, 0, w, w);
  mctx.beginPath(); mctx.arc(c, c, c, 0, Math.PI * 2); mctx.clip();
  mctx.fillStyle = '#2C8CC4'; mctx.fillRect(0, 0, w, w);
  mctx.translate(c, c); mctx.rotate(rot - Math.PI); mctx.scale(sc, sc); mctx.translate(-px, -pz);
  mctx.fillStyle = '#E8D3A2'; mctx.fillRect(XMIN, ZMIN, XMAX - XMIN + 400, ZMAX - ZMIN);
  mctx.fillStyle = '#4A4F57'; mctx.fillRect(CITY0, CITY0, CITY1 - CITY0, CITY1 - CITY0);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const sp = SPECIAL[i + ',' + j]; mctx.fillStyle = sp && sp.type === 'park' ? '#7DA35A' : sp ? '#D9A066' : '#BFB7A6'; mctx.fillRect(bMin(i), bMin(j), B, B); }
  const dot = (x, z, r, col) => { mctx.fillStyle = col; mctx.beginPath(); mctx.arc(x, z, r, 0, Math.PI * 2); mctx.fill(); };
  if (fare.state === 'pickup' && fare.client) dot(fare.client.x, fare.client.z, 9, '#F2B300');
  if (fare.state === 'ride' && fare.dest) dot(fare.dest.x, fare.dest.z, 10, '#7CF29A');
  const blink = Math.floor(performance.now() / 250) % 2;
  for (const v of vehicles) if (v.police) dot(v.x, v.z, 7, blink ? '#ff3b3b' : '#3b7bff');
  mctx.restore();
  // edge arrow toward mission when off-map
  const tgt = fare.state === 'pickup' && fare.client ? fare.client : fare.state === 'ride' ? fare.dest : null;
  if (tgt) {
    const dx = tgt.x - px, dz = tgt.z - pz, dd = Math.hypot(dx, dz);
    if (dd * sc > c - 10) { const a = Math.atan2(dx, dz) - rot; mctx.save(); mctx.translate(c - Math.sin(a) * (c - 12), c - Math.cos(a) * (c - 12)); mctx.fillStyle = fare.state === 'ride' ? '#7CF29A' : '#F2B300'; mctx.beginPath(); mctx.arc(0, 0, 9, 0, Math.PI * 2); mctx.fill(); mctx.restore(); }
  }
  // player arrow
  const ph = player.car ? player.car.h : player.h;
  mctx.save(); mctx.translate(c, c); mctx.rotate(-(ph - rot)); mctx.fillStyle = '#fff'; mctx.strokeStyle = '#000'; mctx.lineWidth = 3;
  mctx.beginPath(); mctx.moveTo(0, -14); mctx.lineTo(10, 11); mctx.lineTo(0, 5); mctx.lineTo(-10, 11); mctx.closePath(); mctx.stroke(); mctx.fill(); mctx.restore();
  mctx.fillStyle = '#fff'; mctx.font = 'bold 22px Figtree, sans-serif'; mctx.textAlign = 'center';
  const nA = -(Math.PI - rot) - Math.PI / 2; mctx.fillText('N', c + Math.cos(nA) * (c - 20), c + Math.sin(nA) * (c - 20) + 8);
}

// ---------------------------------------------------------------- camera
let camMode = 0; // 0 chase, 1 far chase, 2 top-down
let shake = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function cycleCam() { camMode = (camMode + 1) % 3; toast(['Caméra : poursuite', 'Caméra : large', 'Caméra : vue du ciel'][camMode]); }
function updateCamera(dt) {
  const t = player.car || player; const tx = t.x, tz = t.z;
  if (player.car) {
    const v = player.car; const sp = Math.abs(v.vf);
    if (manualCam <= 0 && sp > 1) camYaw += angDiff(camYaw, v.h) * Math.min(1, dt * 3.2);
    camPitch = lerp(camPitch, 0.3, dt * 1.5);
  }
  manualCam -= dt;
  const portrait = camera.aspect < 0.8 ? 1.25 : 1;
  const dist = portrait * (camMode === 0 ? (player.car ? 11 + Math.abs(player.car.vf) * 0.12 + player.car.T.len * 0.4 : 7) : camMode === 1 ? (player.car ? 22 : 14) : 0);
  let want, look;
  if (camMode === 2) { want = new THREE.Vector3(tx, 75, tz + 18); look = new THREE.Vector3(tx, 0, tz); }
  else {
    const f = fwd(camYaw); const pit = camMode === 1 ? 0.55 : camPitch;
    want = new THREE.Vector3(tx - f.x * dist * Math.cos(pit), 1.5 + dist * Math.sin(pit) + (player.car ? 1.5 : 0.8), tz - f.z * dist * Math.cos(pit));
    look = new THREE.Vector3(tx + f.x * 3, player.car ? 1.6 : 1.4, tz + f.z * 3);
  }
  const k = 1 - Math.exp(-dt * (camMode === 2 ? 4 : 7));
  camPos.lerp(want, k); camLook.lerp(look, k);
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (R01() - 0.5) * shake; camera.position.y += (R01() - 0.5) * shake; shake = Math.max(0, shake - dt * 2.5); }
  camera.lookAt(camLook);
  const sp = player.car ? Math.abs(player.car.vf) : 0;
  camera.fov = lerp(camera.fov, (camera.aspect < 0.8 ? 74 : 62) + Math.min(14, sp * 0.35), dt * 2); camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- day / night
const headLight = new THREE.SpotLight(0xfff3d6, 0, 60, 0.55, 0.5, 1.2); scene.add(headLight, headLight.target);
function updateSky(dt) {
  gameHour += dt / 30; if (gameHour >= 24) { gameHour -= 24; gameDay = (gameDay + 1) % 7; }
  const h = gameHour;
  let night = h >= 19.5 || h < 5.2 ? 1 : h >= 17.6 ? (h - 17.6) / 1.9 : h < 7 ? (7 - h) / 1.8 : 0;
  night = clamp(night, 0, 1);
  const dusk = clamp(1 - Math.abs(h - 18.4) / 1.4, 0, 1) + clamp(1 - Math.abs(h - 6.4) / 1.2, 0, 1) * 0.7;
  const sky = DAY_SKY.clone().lerp(DUSK_SKY, clamp(dusk, 0, 1) * 0.85).lerp(NIGHT_SKY, night);
  scene.background.copy(sky); scene.fog.color.copy(sky);
  nightU.value = night;
  hemi.intensity = lerp(1.6, 0.32, night); hemi.color.set(night > 0.5 ? '#8fa4d6' : '#dfefff');
  sun.intensity = lerp(2.3, 0.15, night);
  sun.color.set(dusk > 0.3 ? '#ffb27a' : '#fff1d6');
  const a = (h - 6) / 12 * Math.PI; const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z;
  sun.position.set(px + Math.cos(a) * 120, 40 + Math.max(0.15, Math.sin(a)) * 140, pz + 60);
  sun.target.position.set(px, 0, pz);
  MAT.lamp.emissiveIntensity = night * 1.6; MAT.head.emissiveIntensity = 0.2 + night * 1.4; MAT.tail.emissiveIntensity = 0.3 + night;
  MAT.sea.emissiveIntensity = 0.15 * (1 - night);
  const v = player.car;
  if (v && night > 0.2) { const f = fwd(v.h); headLight.intensity = 400 * night; headLight.position.set(v.x + f.x * (v.rad - 0.3), 1.2, v.z + f.z * (v.rad - 0.3)); headLight.target.position.set(v.x + f.x * 22, 0, v.z + f.z * 22); }
  else headLight.intensity = 0;
  $('#clock').textContent = DAYS[gameDay] + ' ' + String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
}

// ---------------------------------------------------------------- main loop
let started = false, paused = false, last = performance.now(), miniT = 0, crashCool = 0;
function update(dt) {
  if (bigT > 0) { bigT -= dt; if (bigT <= 0) $('#big').innerHTML = ''; }
  wantedCool -= dt;
  const ax = axis();
  // player
  if (player.car) {
    const v = player.car;
    v.inp.thr = ax.y; v.inp.steer = ax.x; v.inp.hand = keys.has(' ') || btn.hand ? 1 : 0;
    player.x = v.x; player.z = v.z;
  } else if (player.down > 0) {
    player.down -= dt; player.mesh.rotation.x = -Math.PI / 2; if (player.down <= 0) player.mesh.rotation.x = 0;
  } else {
    const f = fwd(camYaw), r = { x: -f.z, z: f.x };
    let mx = f.x * ax.y + r.x * ax.x, mz = f.z * ax.y + r.z * ax.x; const m = Math.hypot(mx, mz);
    const sprint = keys.has('shift') || btn.sprint;
    if (m > 0.1) {
      mx /= Math.max(1, m); mz /= Math.max(1, m);
      const sp = sprint ? 8.5 : 4.2; player.x += mx * sp * dt; player.z += mz * sp * dt;
      player.h += angDiff(player.h, Math.atan2(mx, mz)) * Math.min(1, dt * 12); player.ph += dt * (sprint ? 16 : 9);
    }
    const c = pushOut(player.x, player.z, 0.45); if (c) { player.x += c.nx * c.d; player.z += c.nz * c.d; }
    for (const v of vehicles) { // cars push / hit the player
      const f2 = fwd(v.h);
      for (const o of v.offs) {
        const dx = player.x - (v.x + f2.x * o), dz = player.z - (v.z + f2.z * o), d = Math.hypot(dx, dz), rr = v.cr + 0.45;
        if (d < rr && d > 1e-4) {
          player.x += dx / d * (rr - d); player.z += dz / d * (rr - d);
          const sp = Math.hypot(v.vx, v.vz);
          if (sp > 6 && player.down <= 0) { player.hp -= sp * 2.2; player.down = 1.8; shake = 0.8; sfx.thud(); if (player.hp <= 0) wasted(); }
        }
      }
    }
    player.mesh.position.set(player.x, 0.3 + (m > 0.1 ? Math.abs(Math.sin(player.ph)) * 0.08 : 0), player.z);
    player.mesh.rotation.y = player.h;
    player.hp = Math.min(100, player.hp + dt * 2);
  }
  // vehicles
  for (const v of vehicles) {
    if (v === player.car) {}
    else if (v.police && v.occupied && !v.wrecked) policeDrive(v, dt);
    else if (v.ai && !v.wrecked) aiDrive(v, dt);
    else v.inp = { thr: 0, steer: 0, hand: 1 };
    stepVehicle(v, dt);
  }
  // vehicle-vehicle collisions
  for (let a = 0; a < vehicles.length; a++) for (let b = a + 1; b < vehicles.length; b++) {
    const A = vehicles[a], Bv = vehicles[b];
    const dx0 = Bv.x - A.x, dz0 = Bv.z - A.z; if (dx0 * dx0 + dz0 * dz0 > (A.rad + Bv.rad + 1) ** 2) continue;
    const fa = fwd(A.h), fb = fwd(Bv.h); let hit = null;
    for (const oa of A.offs) for (const ob of Bv.offs) {
      const ax_ = A.x + fa.x * oa, az_ = A.z + fa.z * oa, bx = Bv.x + fb.x * ob, bz = Bv.z + fb.z * ob;
      const dx = bx - ax_, dz = bz - az_, d = Math.hypot(dx, dz), rr = A.cr + Bv.cr;
      if (d < rr && d > 1e-4 && (!hit || rr - d > hit.p)) hit = { nx: dx / d, nz: dz / d, p: rr - d };
    }
    if (!hit) continue;
    const ma = A.T.mass, mb = Bv.T.mass, tot = ma + mb;
    A.x -= hit.nx * hit.p * mb / tot; A.z -= hit.nz * hit.p * mb / tot; Bv.x += hit.nx * hit.p * ma / tot; Bv.z += hit.nz * hit.p * ma / tot;
    const rv = (Bv.vx - A.vx) * hit.nx + (Bv.vz - A.vz) * hit.nz;
    if (rv < 0) {
      const j = -1.3 * rv / (1 / ma + 1 / mb);
      A.vx -= j / ma * hit.nx; A.vz -= j / ma * hit.nz; Bv.vx += j / mb * hit.nx; Bv.vz += j / mb * hit.nz;
      const imp = -rv;
      if (imp > 5) { damage(A, (imp - 5) * 2.5 * mb / tot * 2); damage(Bv, (imp - 5) * 2.5 * ma / tot * 2); }
      if ((A === player.car || Bv === player.car) && imp > 3) {
        if (crashCool <= 0) { sfx.crash(imp / 30); crashCool = 0.25; }
        const other = A === player.car ? Bv : A;
        if (other.police && imp > 6) addWanted(1, 'Voiture de police percutée');
        else if (other.ai && imp > 9 && R01() < 0.5) { sfx.horn(0.6, 0.2); }
      }
    }
  }
  crashCool -= dt;
  // peds
  for (const p of peds) { updatePed(p, dt); pedVsCars(p); }
  // recycle far traffic & peds around the player
  const px = player.x, pz = player.z;
  for (const v of vehicles) if (v.ai && v !== player.car && Math.hypot(v.x - px, v.z - pz) > 280) { const e = randomEdgeNear(px, pz, 110, 230); if (e) setupAI(v, e.k, e.l, e.dir, R01()); }
  for (const p of peds) if (Math.hypot(p.x - px, p.z - pz) > 220) placePed(p, px, pz);
  // remove abandoned cars far away (keeps the world tidy)
  for (const v of vehicles.slice()) if (!v.ai && !v.police && v !== player.car && !v.parked && Math.hypot(v.x - px, v.z - pz) > 330) { removeVehicle(v); spawnTraffic(1); }
  updatePolice(dt);
  updateFare(dt);
  // siren lights
  const bl = Math.floor(performance.now() / 160) % 2;
  for (const v of vehicles) if (v.g.userData.siren && v.occupied) { v.g.userData.siren[0].emissiveIntensity = bl ? 2 : 0.1; v.g.userData.siren[1].emissiveIntensity = bl ? 0.1 : 2; }
  // beacon pulse
  if (beacon.visible) { const s = 1 + Math.sin(performance.now() / 300) * 0.08; ring.scale.set(s, s, s); }
  // HUD
  const hb = $('#health'); const v = player.car;
  hb.classList.toggle('car', !!v); hb.firstElementChild.style.width = (v ? v.hp / v.T.hp * 100 : player.hp) + '%';
  $('#speed').hidden = !v; if (v) $('#kmh').textContent = Math.round(Math.abs(v.vf) * 3.6);
  const near = !v ? nearestCar(2.6) : null;
  const hint = $('#hint');
  if (!TOUCH && near && !near.wrecked) { hint.hidden = false; hint.innerHTML = `<kbd>E</kbd>${near.occupied ? 'Voler' : 'Monter dans'} : ${near.T.name.toLowerCase()}`; }
  else if (!TOUCH && v && Math.abs(v.vf) < 3) { hint.hidden = false; hint.innerHTML = '<kbd>E</kbd>Descendre'; }
  else hint.hidden = true;
  if (TOUCH) {
    const be = $('#tb-enter'); be.textContent = v ? 'Sortir' : near ? (near.occupied ? 'Voler' : 'Monter') : 'Monter'; be.style.opacity = v || near ? 1 : 0.45;
    $('#tb-hand').hidden = !v; $('#tb-sprint').hidden = !!v;
  }
  const dname = districtAt(px, pz);
  if (dname !== lastDistrict) { lastDistrict = dname; showDistrict(dname); }
  if (distT > 0) { distT -= dt; if (distT <= 0) $('#district').classList.remove('show'); }
  sfx.update(v ? Math.abs(v.vf) : 0, v ? v.T.max : 1, !!v, wanted > 0 && vehicles.some(c => c.police && Math.hypot(c.x - px, c.z - pz) < 120) ? 1 : 0);
  saveT += dt; if (saveT > 4) { saveT = 0; persist(); }
}
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started && !paused) {
    // fixed-ish substeps for stable physics
    const steps = dt > 0.025 ? 2 : 1;
    for (let s = 0; s < steps; s++) update(dt / steps);
    updateSky(dt); updateCamera(dt);
    miniT -= dt; if (miniT <= 0) { miniT = 1 / 20; drawMini(); }
  } else if (!started) {
    // attract mode: slow orbit over the city
    const t = now / 1000 * 0.05; camera.position.set(Math.cos(t) * 260, 120, Math.sin(t) * 260); camera.lookAt(0, 0, 0);
    for (const v of vehicles) { if (v.ai) aiDrive(v, dt); stepVehicle(v, dt); }
    for (const p of peds) updatePed(p, dt);
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- spawn world
function spawnTraffic(n) {
  for (let k = 0; k < n; k++) {
    const r = R01(); const type = r < 0.33 ? 'taxi' : r < 0.6 ? 'sedan' : r < 0.75 ? 'carrapide' : r < 0.88 ? 'suv' : 'moto';
    const v = makeVehicle(type, 0, 0, 0, { ai: true });
    const e = started ? randomEdgeNear(player.x, player.z, 110, 230) : null;
    if (e) setupAI(v, e.k, e.l, e.dir, R01());
    else { const k2 = Math.floor(R01() * N), l2 = Math.floor(R01() * (N + 1)); setupAI(v, k2, l2, [1, 0], R01()); if (R01() < 0.5) setupAI(v, l2, k2, [0, 1], R01()); }
  }
}
function spawnParked() {
  const spots = [];
  for (let k = 0; k <= N; k++) for (let s = 0; s < N; s++) spots.push({ k, s });
  for (let n = 0; n < (TOUCH ? 24 : 34); n++) {
    const { k, s } = pick(spots); const vert = R01() < 0.5; const side = R01() < 0.5 ? 1 : -1;
    const t = lerp(bMin(s) + 8, bMax(s) - 8, R01());
    const x = vert ? roadC(k) + side * (R / 2 - 1.5) : t, z = vert ? t : roadC(k) + side * (R / 2 - 1.5);
    const r = R01(); const dist = districtAt(x, z);
    const type = dist === 'Les Almadies' && r < 0.4 ? 'sport' : r < 0.3 ? 'taxi' : r < 0.6 ? 'sedan' : r < 0.75 ? 'suv' : r < 0.9 ? 'moto' : 'carrapide';
    if (type === 'carrapide') continue;
    const h = vert ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    makeVehicle(type, x, z, h + (R01() - 0.5) * 0.06, { parked: true });
  }
  // car rapides waiting at Colobane, a sportive in front of La Pointe
  const gx = (bMin(6) + bMax(6)) / 2;
  for (let q = -1; q <= 1; q++) makeVehicle('carrapide', gx + q * 12, roadC(8) - LANE - 2.5, Math.PI / 2, { parked: true });
  makeVehicle('sport', (bMin(0) + bMax(0)) / 2, roadC(2) - 5.5, Math.PI / 2, { parked: true });
  // starter taxi next to the player
  makeVehicle('taxi', roadC(1) + 5.5, roadC(9) - 12, Math.PI, { parked: true });
}

// ---------------------------------------------------------------- boot
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
function setPaused(p) {
  if (!started) return; paused = p; $('#pause').hidden = !p;
  if (p) { keys.clear(); if (AC) AC.suspend(); } else { last = performance.now(); if (AC && soundOn) AC.resume(); }
}
$('#m-resume').addEventListener('click', () => setPaused(false));
$('#m-sound').addEventListener('click', () => setSound(!soundOn));
$('#m-shadows').addEventListener('click', e => { renderer.shadowMap.enabled = !renderer.shadowMap.enabled; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); e.target.textContent = 'Ombres : ' + (renderer.shadowMap.enabled ? 'activées' : 'désactivées'); });
$('#m-unstuck').addEventListener('click', () => {
  const k = clamp(Math.round((player.x - roadC(0)) / S), 0, N), l = clamp(Math.round((player.z - roadC(0)) / S), 0, N), p = nodePos(k, l);
  if (player.car) { player.car.x = p.x + 3; player.car.z = p.z + 3; player.car.vx = player.car.vz = 0; } else { player.x = p.x + 3; player.z = p.z + 3; }
  setPaused(false);
});
$('#b-pause').addEventListener('click', () => setPaused(true));
$('#b-cam').addEventListener('click', cycleCam);
$('#b-radio').addEventListener('click', () => radio.toggle());
document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); if (started) setPaused(true); } });

buildCity();
spawnParked();
spawnTraffic(TOUCH ? 18 : 28);
for (let k = 0; k < (TOUCH ? 36 : 50); k++) makePed();
renderStars();
$('#money').textContent = fmt(money);
if (TOUCH) { $('#keys-desk').hidden = true; $('#keys-touch').hidden = false; renderer.shadowMap.enabled = !(window.devicePixelRatio > 2.5 && innerWidth < 400); }
const playBtn = $('#play'); playBtn.disabled = false; playBtn.textContent = 'Jouer';
playBtn.addEventListener('click', () => {
  audioInit(); started = true; $('#start').hidden = true; $('#hud').hidden = false; $('#topbtns').hidden = false;
  if (TOUCH) { $('#touch').hidden = false; setupTouch(); }
  // recycle traffic around the start position
  for (const v of vehicles) if (v.ai) { const e = randomEdgeNear(player.x, player.z, 20, 200); if (e) setupAI(v, e.k, e.l, e.dir, R01()); }
  for (const p of peds) placePed(p, player.x, player.z);
  for (const p of peds.slice(0, 10)) { const i = blockIdx(player.x), j = blockIdx(player.z); p.P = perimeter(i, j); p.t = R01() * p.P.L; }
  camYaw = Math.PI; camPos.set(player.x, 6, player.z + 8); camLook.set(player.x, 1, player.z);
  toast(save.name ? `Bienvenue dans la rue, ${save.name}. Un taxi t’attend juste devant.` : 'Bienvenue à Dakar. Un taxi t’attend juste devant.', 'pink');
  last = performance.now();
});
requestAnimationFrame(frame);
window.__dl = { player, vehicles, peds, get wanted() { return wanted; }, setHour(h) { gameHour = h; }, heat(n) { addWanted(n, 'Test'); } };
