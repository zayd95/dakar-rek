import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import FIT from './headFit.json';
import type { Avatar } from '../core/types';
import type { HairId } from './appearance';
import { GLSL_NOISE, GLSL_TEXTILE } from './glslTextile';

/**
 * Hair and headwear built on a Meshy body's own skull (src/actors/headFit.json, measured from the GLBs), in the shell's model space; MeshyLook carries them
 * into the head bone's frame so they follow every pose. The baked hair is first taken in onto that same skull by the 'shave' morph target
 * (scripts/avatar/add-hair.mjs), so nothing of it shows through.
 *
 *  - afro: a volume grown from the scalp between the hairline and the crown (thin at the hairline, rounded), coiled texture and a soft, broken outline from
 *    three alpha-tested shells over the base one;
 *  - puff (chignon): the hair combed back to a round puff high at the back, with a fabric tie;
 *  - wrap (foulard): a cloth wrapped round the head, overlapping layers, fuller at the crown, a knot and two wings at the front, the garment's colour and print;
 *  - kufi: a fitted cap, flat on top, rolled rim, ivory with an embroidered band in the garment's colour.
 * Everything is a few thousand triangles and one draw per layer; geometry is shared per body and style, materials belong to the wearer.
 */
export interface HeadFit { skull: { c: number[]; r: number[] }; browY: number; capY: number; neckTop: number; neck: number; faceZ: number; eyeY: number; earX: number }
export const HEAD_FIT: Record<Avatar, HeadFit> = { homme: FIT.homme, femme: FIT.femme };

const D = Math.PI / 180;
/** Piecewise-linear over the azimuth (0 = the face, ±180° = the back), symmetric: keys as [degrees, value]. */
const around = (keys: [number, number][]) => (theta: number) => {
  const a = Math.abs(theta) / D;
  for (let i = 1; i < keys.length; i++) if (a <= keys[i][0]) { const [a0, v0] = keys[i - 1], [a1, v1] = keys[i], t = (a - a0) / (a1 - a0), s = t * t * (3 - 2 * t); return v0 + (v1 - v0) * s; }
  return keys[keys.length - 1][1];
};
const hash = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x: number, y: number, z: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t, h = (i: number, j: number, k: number) => hash(ix + i, iy + j, iz + k);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), sx), l(h(0, 1, 0), h(1, 1, 0), sx), sy), l(l(h(0, 0, 1), h(1, 0, 1), sx), l(h(0, 1, 1), h(1, 1, 1), sx), sy), sz);
};

/** A point of the skull ellipsoid by azimuth θ and polar angle φ (0 = top), and its outward normal. */
function skull(F: HeadFit, theta: number, phi: number) {
  const [cx, cy, cz] = F.skull.c, [rx, ry, rz] = F.skull.r;
  const dx = Math.sin(phi) * Math.sin(theta), dy = Math.cos(phi), dz = Math.sin(phi) * Math.cos(theta);
  const p = new THREE.Vector3(cx + dx * rx, cy + dy * ry, cz + dz * rz), n = new THREE.Vector3(dx / rx, dy / ry, dz / rz).normalize();
  return { p, n, d: new THREE.Vector3(dx, dy, dz) };
}

interface CapSpec {
  /** Polar angle (radians) of the lower edge at each azimuth. */
  edge: (theta: number) => number;
  /** Thickness off the skull (m) at an azimuth, a polar angle and v (0 at the top, 1 at the edge). */
  thick: (theta: number, phi: number, v: number, dir: THREE.Vector3) => number;
  /** Close the lower edge with a fold back to the scalp (cloth); otherwise the volume thins out to the hairline (hair). */
  lip?: boolean;
  /** Flatten above this height (a cap's top). */
  flatTop?: number;
  /** Ambient shade 0–1 at a point (the hollow under a layer of cloth); 1 when absent. Attribute `aAo`. */
  shade?: (theta: number, phi: number, v: number) => number;
  seg?: [number, number];
}
/** A surface over the skull from the crown to an edge, at a thickness: one vertex per (azimuth, polar) step, the pole and the seam welded. Attribute `aV` = v. */
function capGeometry(F: HeadFit, s: CapSpec): THREE.BufferGeometry {
  const [nu, nv] = s.seg ?? [96, 36], rows = s.lip ? nv + 2 : nv + 1;
  const pos: number[] = [], av: number[] = [], ao: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const theta = -Math.PI + (2 * Math.PI * i) / nu, edge = s.edge(theta);
    for (let j = 0; j < rows; j++) {
      const v = Math.min(1, j / nv), phi = v * edge, k = skull(F, theta, phi);
      const t = j > nv ? 0.0015 : s.thick(theta, phi, v, k.d);
      const p = k.p.addScaledVector(k.n, t);
      if (s.flatTop !== undefined && p.y > s.flatTop) p.y = s.flatTop + (p.y - s.flatTop) * 0.22;
      pos.push(p.x, p.y, p.z); av.push(j > nv ? 1.05 : v); ao.push(j > nv ? 0.55 : s.shade ? s.shade(theta, phi, v) : 1);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < rows - 1; j++) {
    const a = i * rows + j, b = (i + 1) * rows + j;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aV', new THREE.Float32BufferAttribute(av, 1)); g.setAttribute('aAo', new THREE.Float32BufferAttribute(ao, 1)); g.setIndex(idx);
  g = mergeVertices(g, 1e-5); g.computeVertexNormals(); return g;
}
/** An ellipsoid blob (a puff, a knot, a wing), its own outline roughened. */
function blob(radii: [number, number, number], rough: number, detail = 3): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + rough * (vnoise(x * 3.3 + 7, y * 3.3, z * 3.3) - 0.5) + rough * 0.5 * (vnoise(x * 9, y * 9 + 3, z * 9) - 0.5);
    p.setXYZ(i, x * radii[0] * k, y * radii[1] * k, z * radii[2] * k);
  }
  const m = mergeVertices(new THREE.BufferGeometry().setAttribute('position', p), 1e-6);
  const n = m.getAttribute('position').count;
  m.setAttribute('aV', new THREE.Float32BufferAttribute(new Array(n).fill(0.5), 1)); m.setAttribute('aAo', new THREE.Float32BufferAttribute(new Array(n).fill(1), 1));
  m.computeVertexNormals(); return m;
}
const place = (g: THREE.BufferGeometry, at: THREE.Vector3, up: THREE.Vector3, roll = 0, tilt = 0) => {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up.clone().normalize());
  const m = new THREE.Matrix4().makeRotationY(roll).premultiply(new THREE.Matrix4().makeRotationX(tilt)).premultiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).setPosition(at);
  return g.applyMatrix4(m);
};
function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], av: number[] = [], ao: number[] = [], idx: number[] = []; let off = 0;
  for (const g of gs) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), v = g.getAttribute('aV'), o = g.getAttribute('aAo');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); av.push(v ? v.getX(i) : 0.5); ao.push(o ? o.getX(i) : 1); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('aV', new THREE.Float32BufferAttribute(av, 1)); m.setAttribute('aAo', new THREE.Float32BufferAttribute(ao, 1)); m.setIndex(idx);
  return m;
}

// ------------------------------------------------------------------ the styles' shapes, per body
/** Where the hair grows (the hairline): polar angle by azimuth. Same for the afro and the combed-back hair under a puff. */
const HAIRLINE: Record<Avatar, (t: number) => number> = {
  homme: around([[0, 55 * D], [30, 60 * D], [55, 74 * D], [75, 86 * D], [100, 90 * D], [140, 108 * D], [180, 114 * D]]),
  femme: around([[0, 56 * D], [30, 61 * D], [55, 76 * D], [75, 88 * D], [100, 93 * D], [140, 110 * D], [180, 117 * D]]),
};
/** The same hairline for the shader (src/actors/meshyLook.ts): polar angle = x + y·smoothstep(15°, 95°, |θ|) + z·smoothstep(95°, 180°, |θ|), radians. */
export const HAIRLINE_GLSL: Record<Avatar, [number, number, number]> = { homme: [55 * D, 35 * D, 24 * D], femme: [56 * D, 37 * D, 24 * D] };
function afroGeometry(a: Avatar): THREE.BufferGeometry {
  const F = HEAD_FIT[a], big = a === 'femme';
  const top = big ? 0.062 : 0.04, side = big ? 0.052 : 0.032, back = big ? 0.056 : 0.036;
  return capGeometry(F, {
    edge: HAIRLINE[a], seg: [112, 40],
    thick: (theta, phi, v, d) => {
      const up = Math.cos(phi), base = side + (top - side) * Math.max(0, up) ** 1.2 + (back - side) * Math.max(0, -Math.cos(theta)) * (1 - Math.abs(up));
      const e = Math.min(1, (1 - v) / 0.3), edge = 1 - (1 - e) ** 2.2;                       // rounded down to the hairline
      const lumpy = 1 + 0.13 * (vnoise(d.x * 4 + 11, d.y * 4, d.z * 4) - 0.5) + 0.07 * (vnoise(d.x * 10, d.y * 10 + 5, d.z * 10) - 0.5);
      return 0.0035 + (base * lumpy - 0.0035) * edge;
    },
  });
}
function puffGeometry(a: Avatar): { puff: THREE.BufferGeometry; tie: THREE.BufferGeometry } {
  const F = HEAD_FIT[a], k = skull(F, Math.PI, 42 * D), R = a === 'femme' ? 0.064 : 0.05;
  const puff = place(blob([R, R * 0.9, R * 0.95], 0.16, 4), k.p.clone().addScaledVector(k.n, R * 0.78), k.n);
  const tie = new THREE.TorusGeometry(R * 0.5, 0.0065, 8, 28); tie.rotateX(Math.PI / 2);
  tie.setAttribute('aV', new THREE.Float32BufferAttribute(new Array(tie.getAttribute('position').count).fill(0.5), 1));
  return { puff, tie: place(tie, k.p.clone().addScaledVector(k.n, 0.012), k.n) };
}
function wrapGeometry(a: Avatar): THREE.BufferGeometry {
  const F = HEAD_FIT[a], sig = (x: number) => 1 / (1 + Math.exp(-x));
  // the cloth's turns: one round the hairline, then two crossing over the forehead (the X of a wrapped musoor) and meeting again at the back
  const turns = [(t: number) => (66 + 6 * Math.cos(t)) * D, (t: number) => (47 + 24 * Math.sin(t)) * D, (t: number) => (47 - 24 * Math.sin(t)) * D];
  const layer = (theta: number, phi: number) => turns.reduce((s, f) => s + sig((f(theta) - phi) / (1.6 * D)), 0);
  const thick = (theta: number, phi: number) => {
    let t = 0.01 + 0.04 * Math.exp(-((((phi / D) - 32) / 30) ** 2)) * (0.5 + 0.5 * -Math.cos(theta));          // volume high at the back
    t += 0.0085 * layer(theta, phi);                                                                          // each turn lies over the one below
    t += 0.0022 * Math.sin(theta * 7 + phi * 9) * Math.sin(phi * 2.5);                                       // soft creases
    return t;
  };
  const cap = capGeometry(F, {
    edge: around([[0, 61 * D], [40, 69 * D], [80, 92 * D], [110, 103 * D], [150, 116 * D], [180, 120 * D]]), lip: true, seg: [144, 52],
    thick: (theta, phi) => thick(theta, phi),
    shade: (theta, phi) => 1 - 0.45 * turns.reduce((s, f) => { const x = (f(theta) - phi) / (1.6 * D); return Math.max(s, Math.exp(-((x + 1.6) ** 2) * 0.6)); }, 0),   // the hollow just under each turn's edge
  });
  // the knot where the turns cross, and the two wings of cloth rising from it
  const kt = 0, kp = 46 * D, kn = skull(F, kt, kp), at = kn.p.clone().addScaledVector(kn.n, thick(kt, kp) + 0.008);
  const knot = place(blob([0.026, 0.02, 0.022], 0.12), at, kn.n);
  const wings = [-1, 1].map(s => {
    const w = blob([0.032, 0.05, 0.011], 0.08);
    w.translate(0, 0.04, 0); w.rotateZ(-s * 0.62); w.rotateX(-0.42); w.rotateY(s * 0.25);
    return place(w, at.clone(), new THREE.Vector3(0, 1, 0));
  });
  return merge([cap, knot, ...wings]);
}
function kufiGeometry(a: Avatar): THREE.BufferGeometry {
  const F = HEAD_FIT[a], top = F.skull.c[1] + F.skull.r[1] + 0.012;
  return capGeometry(F, {
    edge: around([[0, 57 * D], [60, 68 * D], [100, 77 * D], [180, 83 * D]]), lip: true, flatTop: top, seg: [96, 30],
    thick: (_t, _p, v) => 0.0085 + 0.016 * (1 - v) ** 0.6 + 0.0028 * Math.exp(-(((v - 0.95) / 0.05) ** 2)),   // a taller crown, the rolled rim
  });
}

const geoCache = new Map<string, THREE.BufferGeometry | { puff: THREE.BufferGeometry; tie: THREE.BufferGeometry }>();
const cached = <T extends THREE.BufferGeometry | { puff: THREE.BufferGeometry; tie: THREE.BufferGeometry }>(key: string, make: () => T): T => (geoCache.get(key) as T | undefined) ?? (geoCache.set(key, make()), geoCache.get(key) as T);

// ------------------------------------------------------------------ materials
/** Dark, warm hair colour (linear values come from THREE.Color). */
export const HAIR_COLOR = 0x1d1511;
const HAIR_GLSL = /* glsl */`
uniform float uShell, uCut; uniform vec3 uTip;
varying vec3 vHp;
${GLSL_NOISE}
`;
/** Coiled hair: albedo broken by a fine noise, deeper in the hollows; `shell` > 0 draws an outer layer, offset and alpha-tested, for the soft outline. */
function hairMaterial(shell: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: HAIR_COLOR });
  const u = { uShell: { value: shell * 0.0042 }, uCut: { value: [0, 0.5, 0.62, 0.74][shell] }, uTip: { value: new THREE.Color(0x3a2a20) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uShell; varying vec3 vHp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * uShell; vHp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${HAIR_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float c1 = tnNoise(vHp * 260.), c2 = tnNoise(vHp * 95. + 3.1), coil = c1 * .6 + c2 * .4;
        if (uShell > 0. && coil < uCut) discard;
        diffuseColor.rgb = mix(diffuseColor.rgb * .55, uTip, smoothstep(.45, .95, coil) * .55) * (.8 + .4 * c2);`);
  };
  m.customProgramCacheKey = () => 'hair-coil-v1';
  return m;
}
const CLOTH_GLSL = /* glsl */`
uniform vec3 uBase, uLight, uDark, uCenter; uniform float uMode;
varying vec3 vHp; varying float vV; varying float vAo;
${GLSL_NOISE}
${GLSL_TEXTILE}
`;
/** Cloth over the head: `mode` 0 = the headwrap (the garment's colour and print), 1 = the kufi (ivory knit, an embroidered band in the garment's colour at the rim). */
function clothMaterial(mode: 0 | 1, base: THREE.Color, light: THREE.Color, dark: THREE.Color, center: number[]): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const u = { uBase: { value: base }, uLight: { value: light }, uDark: { value: dark }, uCenter: { value: new THREE.Vector3(...center) }, uMode: { value: mode } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aV; attribute float aAo; varying vec3 vHp; varying float vV; varying float vAo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHp = position; vV = aV; vAo = aAo;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${CLOTH_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 q = vHp - uCenter; float az = atan(q.x, q.z), el = q.y;
        vec3 col;
        if (uMode < .5) {
          vec3 ink = textileInks(vec2(az * 3.2, el * 22.));
          col = uBase * ink.x + uLight * ink.y + uDark * ink.z;
          col *= .9 + .1 * tnNoise(vHp * 400.);
        } else {
          float rib = .9 + .1 * smoothstep(.3, .7, abs(fract(az * 38.) - .5) * 2.);
          col = uLight * rib * (.94 + .06 * tnNoise(vHp * 500.));
          float band = smoothstep(.62, .66, vV) * (1. - smoothstep(.9, .94, vV));
          vec3 ink = textileInks(vec2(az * 5., (vV - .62) * 3.4));
          col = mix(col, uBase * ink.x + uLight * ink.y + uDark * ink.z, band);
        }
        diffuseColor.rgb = col * vAo;`);
  };
  m.customProgramCacheKey = () => 'head-cloth-v2';
  return m;
}

export interface HairRig { group: THREE.Group; dispose(): void }
/** The meshes of a procedural style on a body (null for the baked hair and the shaved head), in the shell's model space. */
export function buildHairStyle(style: HairId, a: Avatar, garment: number): HairRig | null {
  if (style === 'natural' || style === 'shaved') return null;
  const group = new THREE.Group(), mats: THREE.Material[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => { const mesh = new THREE.Mesh(g, m); mesh.name = name; mesh.castShadow = true; mesh.frustumCulled = false; group.add(mesh); mats.push(m); };
  const base = new THREE.Color(garment), light = new THREE.Color(0xf3ead6), dark = base.clone().multiplyScalar(0.42);
  if (base.r + base.g + base.b > 2.1) { light.setHex(0x2c3b6b); dark.setHex(0x1c2238); }       // an ivory cloth takes indigo inks
  if (style === 'afro') { const g = cached(`afro:${a}`, () => afroGeometry(a)); for (let s = 0; s < 4; s++) add(g, hairMaterial(s), s ? `hair_afro_shell${s}` : 'hair_afro'); }
  if (style === 'puff') {
    const g = cached(`puff:${a}`, () => puffGeometry(a));
    for (let s = 0; s < 3; s++) add(g.puff, hairMaterial(s), s ? `hair_puff_shell${s}` : 'hair_puff');
    add(g.tie, new THREE.MeshLambertMaterial({ color: base }), 'hair_puff_tie');
  }
  if (style === 'wrap') add(cached(`wrap:${a}`, () => wrapGeometry(a)), clothMaterial(0, base, light, dark, HEAD_FIT[a].skull.c), 'hair_wrap');
  if (style === 'kufi') add(cached(`kufi:${a}`, () => kufiGeometry(a)), clothMaterial(1, base, new THREE.Color(0xeee7d6), dark, HEAD_FIT[a].skull.c), 'hair_kufi');
  group.name = `hair_${style}`;
  return { group, dispose: () => { for (const m of mats) m.dispose(); group.removeFromParent(); } };
}
/** How the taken-in hair under a style is shaded: 0 the baked texture, 1 a shaved scalp (skin with stubble), 2 hair combed close to the head. */
export const scalpMode = (style: HairId): 0 | 1 | 2 => style === 'natural' ? 0 : style === 'shaved' ? 1 : 2;
/** The direction the close hair is combed toward (the puff's place; up and back otherwise), in the shell's model space. */
export function combToward(style: HairId, a: Avatar): THREE.Vector3 {
  return style === 'puff' ? skull(HEAD_FIT[a], Math.PI, 42 * D).d : new THREE.Vector3(0, 0.6, -0.8).normalize();
}
