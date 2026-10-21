// The car body author: an original, unbranded body built from numbers (side and plan profiles, cross-sections), with the details
// laid onto it as projected decals (glass, lamps, grille, plates, seams), spoked wheels and an opening driver's door, written as a GLB
// in the game's vehicle format (src/actors/glbVehicle.ts: `body` > paint + trim, `door` at its hinge, `cabin`, `axle_<id>` > `wheel_<id>`).
// No downloaded model, no photograph, no badge: everything here is drawn by these functions. Run through build.ts (vite-node).
import * as THREE from 'three';

export type P2 = [number, number];
export type V3 = [number, number, number];

/** Monotone cubic through points sorted by their first coordinate (Fritsch–Carlson): smooth profiles that never overshoot. */
export function curve(pts: readonly P2[]): (x: number) => number {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), d: number[] = [], m: number[] = new Array(n).fill(0);
  if (n === 1) return () => ys[0];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ the body's numbers
export interface BodySpec {
  /** Overall length and body width without the mirrors (m). */
  L: number; W: number;
  /** Centreline top (z, y): bumper top at the tail, tailgate, rear window, roof, windscreen, bonnet, nose. */
  top: P2[];
  /** The shoulder (z, y): where the side meets the glass or the bonnet. Clamped under the top. */
  belt: P2[];
  /** The underside (z, y), without the wheel arches. */
  bot: P2[];
  /** Plan rounding of the nose and the tail: from z0 to the end, exponent (2 round … 5 square). */
  front: { z0: number; p: number }; rear: { z0: number; p: number };
  /** Half width of the roof edge (z, x): the tumblehome of the glass. */
  roofHw: P2[];
  /** Greenhouse squareness (superellipse exponent: 3 soft … 8 boxy) and how far the shoulder steps in (m). */
  n: number; shoulderIn: number;
  /** The bottom of the side tucks in by this (m); the widest point sits at this share of the side's height. */
  tuck: number; waist: number;
  /** Wheels: axle z, hub height = radius, arch radius (m). */
  axles: { z: number; r: number; arch: number }[];
  /** The roof and pillars zone (z range: rear window foot … windscreen foot) and whether it is black (a floating roof), else paint. */
  greenhouse: [number, number]; blackRoof: boolean;
  /** Extra stations (m) the loft must pass through (door edges, lamp edges). */
  stations?: number[];
}
const RING_LOW = 6, RING_UP = 8;              // half section: 6 points from the bottom centre to the belt, 8 more up to the roof centre
export const HALF = RING_LOW + RING_UP;        // points per half section
/** The index of the upper point where the side glass ends and the roof begins (the door's top edge). */
export const ROOF_EDGE = RING_LOW + 4;

export interface Body {
  spec: BodySpec;
  zs: number[];
  /** Half sections (x ≥ 0), HALF points each, from the bottom centre to the top centre. */
  rings: P2[][];
  top: (z: number) => number; belt: (z: number) => number; bot: (z: number) => number; plan: (z: number) => number;
}

export function makeBody(s: BodySpec): Body {
  const top = curve(s.top), beltRaw = curve(s.belt), botRaw = curve(s.bot), roofHw = curve(s.roofHw);
  const belt = (z: number) => Math.min(beltRaw(z), top(z) - 0.025);
  const bot = (z: number) => {
    let b = botRaw(z);
    for (const a of s.axles) { const dz = z - a.z; if (Math.abs(dz) < a.arch) b = Math.max(b, a.r + Math.sqrt(a.arch * a.arch - dz * dz)); }
    return b;
  };
  const h = s.L / 2;
  const plan = (z: number) => {
    if (z > s.front.z0) { const u = clamp((z - s.front.z0) / (h - s.front.z0), 0, 1); return Math.pow(1 - Math.pow(u, s.front.p), 1 / s.front.p); }
    if (z < s.rear.z0) { const u = clamp((s.rear.z0 - z) / (s.rear.z0 + h), 0, 1); return Math.pow(1 - Math.pow(u, s.rear.p), 1 / s.rear.p); }
    return 1;
  };
  // stations: dense at the ends (where the plan rounds) and at the arches, through every edge asked for
  const zs = new Set<number>();
  const add = (z: number) => zs.add(Math.round(clamp(z, -h, h) * 1e4) / 1e4);
  for (let i = 0; i <= 40; i++) add(-h + (s.L * i) / 40);
  for (let i = 0; i <= 12; i++) { const u = Math.pow(i / 12, 0.6); add(h - (h - s.front.z0) * (1 - u) * 0 - (h - s.front.z0) * (1 - u)); add(-h + (s.rear.z0 + h) * (1 - u)); }
  for (const a of s.axles) for (let i = -8; i <= 8; i++) add(a.z + (a.arch * i) / 8 * 1.0);
  for (const a of s.axles) { add(a.z - a.arch - 0.02); add(a.z + a.arch + 0.02); }
  add(s.greenhouse[0]); add(s.greenhouse[1]);
  for (const z of s.stations ?? []) add(z);
  const list = [...zs].sort((a, b) => a - b).filter((z, i, a) => i === 0 || z - a[i - 1] > 0.004);
  const Wh = s.W / 2;
  const rings = list.map(z => {
    const t = top(z), be = belt(z), b = Math.min(bot(z), be - 0.08), k = plan(z);
    const xs = Wh - s.shoulderIn, hgt = t - be, xr = Math.min(xs, roofHw(z)), lean = (xs - xr) * smooth(0.04, 0.4, hgt);
    const ring: P2[] = [
      [0, b], [(Wh - s.tuck) * 0.82, b], [Wh - s.tuck, b + Math.min(0.05, (be - b) * 0.2)],
      [Wh - 0.012, b + (be - b) * s.waist * 0.55], [Wh, b + (be - b) * s.waist], [xs, be],
    ];
    for (let i = 1; i <= RING_UP; i++) {
      const th = (i / RING_UP) * Math.PI / 2, c = Math.pow(Math.cos(th), 2 / s.n), sn = Math.pow(Math.sin(th), 2 / s.n);
      ring.push([i === RING_UP ? 0 : (xs - lean * sn) * c, be + hgt * sn]);
    }
    return ring.map(([x, y]) => [x * k, y] as P2);
  });
  return { spec: s, zs: list, rings, top, belt, bot, plan };
}

// ------------------------------------------------------------------------------------------------ geometry being built
/** A triangle soup with per-vertex position, normal, uv and colour; one per primitive. */
export class Soup {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  vert(p: V3, n: V3, uv: P2 = [0, 0], c: V3 = [1, 1, 1]) { this.pos.push(...p); this.nor.push(...n); this.uv.push(...uv); this.col.push(...c); return this.pos.length / 3 - 1; }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  get tris() { return this.idx.length / 3; }
  append(o: Soup) {
    const base = this.pos.length / 3;
    this.pos.push(...o.pos); this.nor.push(...o.nor); this.uv.push(...o.uv); this.col.push(...o.col);
    for (const i of o.idx) this.idx.push(i + base);
  }
  /** Moves every vertex by -p (a node's local frame). */
  shift(p: V3) { for (let i = 0; i < this.pos.length; i += 3) { this.pos[i] -= p[0]; this.pos[i + 1] -= p[1]; this.pos[i + 2] -= p[2]; } return this; }
  static from(g: THREE.BufferGeometry, uv: P2, c: V3 = [1, 1, 1]): Soup {
    const s = new Soup(), gg = g.index ? g.toNonIndexed() : g; gg.computeVertexNormals();
    const p = gg.attributes.position, n = gg.attributes.normal;
    for (let i = 0; i < p.count; i++) s.vert([p.getX(i), p.getY(i), p.getZ(i)], [n.getX(i), n.getY(i), n.getZ(i)], uv, c);
    for (let i = 0; i < p.count; i += 3) s.tri(i, i + 1, i + 2);
    return s;
  }
  mesh(mat: THREE.Material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setIndex(this.idx); return new THREE.Mesh(g, mat);
  }
}

// ------------------------------------------------------------------------------------------------ the atlas (every detail's texture)
/** Cells of the trim atlas (1024 px, an 8 × 8 grid of 128 px cells; a wide cell spans several). uv rect: [u0, v0, u1, v1] in 0–1, v up. */
export interface Cell { x: number; y: number; w: number; h: number }
export const ATLAS = 1024, CELL = 128;
export const CELLS: Record<string, Cell> = {
  black: { x: 0, y: 0, w: 1, h: 1 }, matte: { x: 1, y: 0, w: 1, h: 1 }, glass: { x: 2, y: 0, w: 1, h: 1 }, chrome: { x: 3, y: 0, w: 1, h: 1 },
  tyre: { x: 4, y: 0, w: 1, h: 1 }, under: { x: 5, y: 0, w: 1, h: 1 }, interior: { x: 6, y: 0, w: 1, h: 1 }, seat: { x: 7, y: 0, w: 1, h: 1 },
  rimSilver: { x: 0, y: 1, w: 1, h: 1 }, rimGun: { x: 1, y: 1, w: 1, h: 1 }, rimBlack: { x: 2, y: 1, w: 1, h: 1 }, disc: { x: 3, y: 1, w: 1, h: 1 },
  caliper: { x: 4, y: 1, w: 1, h: 1 }, plate: { x: 5, y: 1, w: 1, h: 1 }, amber: { x: 6, y: 1, w: 1, h: 1 }, seam: { x: 7, y: 1, w: 1, h: 1 },
  headA: { x: 0, y: 2, w: 2, h: 1 }, headB: { x: 2, y: 2, w: 2, h: 1 }, tailA: { x: 4, y: 2, w: 2, h: 1 }, tailB: { x: 6, y: 2, w: 2, h: 1 },
  grilleHex: { x: 0, y: 3, w: 2, h: 1 }, grilleMesh: { x: 2, y: 3, w: 2, h: 1 }, vent: { x: 4, y: 3, w: 1, h: 1 }, fog: { x: 5, y: 3, w: 1, h: 1 },
  lightbar: { x: 6, y: 3, w: 2, h: 1 }, headC: { x: 0, y: 4, w: 2, h: 1 }, tailC: { x: 2, y: 4, w: 2, h: 1 }, grilleBar: { x: 4, y: 4, w: 2, h: 1 },
  redGloss: { x: 6, y: 4, w: 1, h: 1 }, silver: { x: 7, y: 4, w: 1, h: 1 }, headD: { x: 0, y: 5, w: 2, h: 1 }, tailD: { x: 2, y: 5, w: 2, h: 1 },
  grilleKidney: { x: 4, y: 5, w: 2, h: 1 }, rimTwo: { x: 6, y: 5, w: 1, h: 1 }, led: { x: 7, y: 5, w: 1, h: 1 },
};
/** uv of a point (0–1 within the cell, v up) of a cell, inset by 3 px so mipmaps never bleed. */
export function cellUv(name: string, u: number, v: number): P2 {
  const c = CELLS[name]; if (!c) throw new Error(`no atlas cell ${name}`);
  const ins = 3 / ATLAS, u0 = (c.x * CELL) / ATLAS + ins, u1 = ((c.x + c.w) * CELL) / ATLAS - ins;
  const v0 = 1 - ((c.y + c.h) * CELL) / ATLAS + ins, v1 = 1 - (c.y * CELL) / ATLAS - ins;
  return [u0 + (u1 - u0) * clamp(u, 0, 1), v0 + (v1 - v0) * clamp(v, 0, 1)];
}
/** The atlas drawn as SVG (rendered to PNG by sharp in build.ts). Every pattern is original and generic: no maker's mark anywhere. */
export function atlasSvg(): string {
  const C = CELL, at = (n: string) => CELLS[n], box = (n: string) => { const c = at(n); return { x: c.x * C, y: c.y * C, w: c.w * C, h: c.h * C }; };
  const out: string[] = [];
  const rect = (n: string, fill: string) => { const b = box(n); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${fill}"/>`); };
  const grad = (id: string, stops: [number, string][], vertical = true) => `<linearGradient id="${id}" x1="0" y1="${vertical ? 1 : 0}" x2="${vertical ? 0 : 1}" y2="0">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const defs = [
    grad('gGlass', [[0, '#0b1117'], [0.55, '#1c2731'], [0.85, '#3d4c59'], [1, '#55626d']]),
    grad('gBlack', [[0, '#0c0d0f'], [0.7, '#17191c'], [1, '#2a2d31']]),
    grad('gChrome', [[0, '#7d8186'], [0.45, '#e9ebee'], [0.55, '#aeb2b7'], [1, '#f4f5f6']]),
    grad('gTail', [[0, '#4a080b'], [0.5, '#9e1318'], [1, '#d8262c']]),
    grad('gRed', [[0, '#7c0d12'], [1, '#c41a21']]),
    grad('gSilver', [[0, '#8e9297'], [1, '#d9dcdf']]),
    `<pattern id="pHex" width="22" height="19" patternUnits="userSpaceOnUse"><rect width="22" height="19" fill="#09090a"/><path d="M5.5 1 L16.5 1 L21 9.5 L16.5 18 L5.5 18 L1 9.5 Z" fill="none" stroke="#3a3d41" stroke-width="2.2"/></pattern>`,
    `<pattern id="pMesh" width="16" height="12" patternUnits="userSpaceOnUse"><rect width="16" height="12" fill="#0a0a0b"/><path d="M0 6 L8 0 L16 6 L8 12 Z" fill="none" stroke="#33363a" stroke-width="2"/></pattern>`,
    `<pattern id="pBar" width="16" height="14" patternUnits="userSpaceOnUse"><rect width="16" height="14" fill="#0b0b0c"/><rect y="5" width="16" height="4" fill="#2e3135"/></pattern>`,
    `<pattern id="pKid" width="10" height="128" patternUnits="userSpaceOnUse"><rect width="10" height="128" fill="#0a0a0b"/><rect x="3" width="4" height="128" fill="#33363b"/></pattern>`,
  ];
  out.push(`<defs>${defs.join('')}</defs>`, `<rect width="${ATLAS}" height="${ATLAS}" fill="#202022"/>`);
  rect('black', 'url(#gBlack)'); rect('matte', '#1b1c1e'); rect('glass', 'url(#gGlass)'); rect('chrome', 'url(#gChrome)');
  rect('tyre', '#161616'); rect('under', '#0e0e0f'); rect('interior', '#2c2b2b'); rect('seat', '#1d1d20');
  rect('rimSilver', '#c3c7cc'); rect('rimGun', '#4b4f55'); rect('rimBlack', '#18191b'); rect('disc', '#5d5f63');
  rect('caliper', '#b3171d'); rect('amber', '#e08a12'); rect('seam', '#121213'); rect('redGloss', 'url(#gRed)'); rect('silver', 'url(#gSilver)');
  rect('rimTwo', '#2a2c30'); rect('led', '#f5f8ff');
  { const b = box('plate'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#1a1a1a"/><rect x="${b.x + 6}" y="${b.y + 6}" width="${b.w - 12}" height="${b.h - 12}" rx="6" fill="#f1f1ec"/>`); }
  // lamps: a smoked housing, reflectors, the light guide; four designs (A city hatch, B luxury SUV, C sporty hatch, D SUV coupé)
  { const b = box('headA'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#1c2228"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="16" fill="#eef4ff"/><rect x="${b.x + 18}" y="${b.y + 30}" width="${b.w - 36}" height="10" rx="5" fill="#cfe0ff"/>`, ...[0, 1, 2].map(i => `<circle cx="${b.x + 60 + i * 66}" cy="${b.y + 82}" r="24" fill="#8f9aa6"/><circle cx="${b.x + 60 + i * 66}" cy="${b.y + 82}" r="13" fill="#e6edf5"/>`)); }
  { const b = box('headB'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#151a1f"/><rect x="${b.x}" y="${b.y + 10}" width="${b.w}" height="12" fill="#f4f8ff"/><rect x="${b.x + 10}" y="${b.y + 104}" width="${b.w - 20}" height="8" fill="#dfe9ff"/>`, ...[0, 1, 2, 3].map(i => `<rect x="${b.x + 22 + i * 56}" y="${b.y + 44}" width="36" height="40" rx="6" fill="#7c8793"/><rect x="${b.x + 28 + i * 56}" y="${b.y + 52}" width="24" height="24" rx="4" fill="#e9eef4"/>`)); }
  { const b = box('headC'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#161b21"/><circle cx="${b.x + 70}" cy="${b.y + 70}" r="30" fill="#8e99a5"/><circle cx="${b.x + 70}" cy="${b.y + 70}" r="17" fill="#e8eef5"/>`, ...[0, 1, 2].map(i => `<path d="M${b.x + 140 + i * 34} ${b.y + 18} L${b.x + 128 + i * 34} ${b.y + 112}" stroke="#f4f8ff" stroke-width="11"/>`)); }
  { const b = box('headD'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#14191e"/><path d="M${b.x + 10} ${b.y + 30} L${b.x + b.w - 10} ${b.y + 14}" stroke="#f4f8ff" stroke-width="12"/>`, ...[0, 1].map(i => `<path d="M${b.x + 40 + i * 110} ${b.y + 100} q30 -40 70 0" stroke="#eaf1ff" stroke-width="9" fill="none"/>`)); }
  { const b = box('tailA'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#gTail)"/><rect x="${b.x}" y="${b.y + 44}" width="${b.w}" height="14" fill="#ff5a5f"/><rect x="${b.x + 150}" y="${b.y + 76}" width="70" height="26" fill="#e8e8ea"/>`); }
  { const b = box('tailB'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#6a0c12"/><rect x="${b.x}" y="${b.y + 18}" width="${b.w}" height="18" fill="#ff4a50"/><rect x="${b.x}" y="${b.y + 56}" width="${b.w}" height="16" fill="#e8242c"/><rect x="${b.x}" y="${b.y + 94}" width="${b.w}" height="6" fill="#d8d8dc"/>`); }
  { const b = box('tailC'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#320609"/>`, ...[0, 1, 2].map(i => `<path d="M${b.x + 30 + i * 70} ${b.y + 110} L${b.x + 60 + i * 70} ${b.y + 18}" stroke="#ff3a3f" stroke-width="13"/>`)); }
  { const b = box('tailD'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#gTail)"/><path d="M${b.x + 10} ${b.y + 100} q60 -90 140 -80 L${b.x + b.w - 8} ${b.y + 22}" stroke="#ff6b70" stroke-width="12" fill="none"/>`); }
  rect('grilleHex', 'url(#pHex)'); rect('grilleMesh', 'url(#pMesh)'); rect('grilleBar', 'url(#pBar)'); rect('grilleKidney', 'url(#pKid)');
  { const b = box('vent'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#0d0e10"/><rect x="${b.x + 8}" y="${b.y + 40}" width="${b.w - 16}" height="10" fill="#9aa0a7"/><rect x="${b.x + 8}" y="${b.y + 78}" width="${b.w - 16}" height="10" fill="#9aa0a7"/>`); }
  { const b = box('fog'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#111214"/><circle cx="${b.x + 64}" cy="${b.y + 64}" r="40" fill="#a8b1bb"/><circle cx="${b.x + 64}" cy="${b.y + 64}" r="24" fill="#eef3f8"/>`); }
  { const b = box('lightbar'); out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#2b070a"/><rect x="${b.x}" y="${b.y + 52}" width="${b.w}" height="20" fill="#ff4146"/>`); }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ATLAS}" height="${ATLAS}">${out.join('')}</svg>`;
}

// ------------------------------------------------------------------------------------------------ the loft
/** Which material a face of the shell takes: paint, the black of a floating roof and pillars, or the dark underside. */
type Zone = 'paint' | 'roof' | 'under';
export interface Shell { paint: Soup; trim: Soup; /** Every face of the shell for the decals' rays (one mesh, the right half included). */ ray: THREE.Mesh;
  /** The faces cut out for the driver's door (+x side): paint and trim, in the car's frame. */ door: { paint: Soup; trim: Soup; inner: Soup };
  liner: Soup }
export interface DoorCut { zF: number; zR: number; low: number }

/**
 * The shell: every section joined to the next. Faces are split by zone (paint, a black roof, the underside); the faces of the driver's door
 * (+x, between zR and zF, from the ring point `low` up to the roof edge) go to the door; the cabin's lining is the shell turned inside out.
 */
export function loft(b: Body, cut: DoorCut | null, cabin: [number, number]): Shell {
  const S = b.spec, n = b.zs.length, H = HALF;
  // full rings: right half mirrored (x < 0), shared centre points
  const full = b.rings.map(r => { const right = r.slice(1, H - 1).reverse().map(([x, y]) => [-x, y] as P2); return [...r, ...right]; });
  const R = full[0].length;                                   // 2·HALF − 2
  const P = (i: number, j: number): V3 => [full[i][j][0], full[i][j][1], b.zs[i]];
  // smooth normals over the whole shell (an indexed grid)
  const nor: THREE.Vector3[] = Array.from({ length: n * R }, () => new THREE.Vector3());
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const quads: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < R; j++) quads.push([i, j]);
  const corner = (i: number, j: number) => [[i, j], [i + 1, j], [i + 1, (j + 1) % R], [i, (j + 1) % R]] as [number, number][];
  for (const [i, j] of quads) {
    const c = corner(i, j);
    for (const [a, bb, cc] of [[0, 2, 1], [0, 3, 2]]) {
      vA.set(...P(...c[a])); vB.set(...P(...c[bb])); vC.set(...P(...c[cc]));
      e1.subVectors(vB, vA); e2.subVectors(vC, vA); const fn = e1.cross(e2);
      for (const k of [a, bb, cc]) nor[c[k][0] * R + c[k][1]].add(fn);
    }
  }
  for (const v of nor) v.normalize();
  // ring order goes bottom → +x side → top → −x side and z grows from the tail: faces (0, 2, 1), (0, 3, 2) of each quad face outward
  const half = (j: number) => (j < H - 1 ? j : R - 1 - j);   // a quad's index on the half ring (0: the bottom centre strip … H−2: the roof centre strip)
  const zoneOf = (i: number, j: number): Zone => {
    const zc = (b.zs[i] + b.zs[i + 1]) / 2, jj = half(j);
    if (jj === 0) return 'under';
    if (S.blackRoof && jj >= RING_LOW - 1 && zc > S.greenhouse[0] && zc < S.greenhouse[1]) return 'roof';
    return 'paint';
  };
  const inDoor = (i: number, j: number) => {
    if (!cut || j >= H - 1) return false;                    // the +x half only
    const zc = (b.zs[i] + b.zs[i + 1]) / 2;
    return zc > cut.zR && zc < cut.zF && j >= cut.low && j < ROOF_EDGE;
  };
  // a soft shade low on the body (the light the ground does not give back), by height only so the arches get no smudge
  const lo = S.axles[0].r * 0.5, hi = S.axles[0].r * 1.9;
  const colour = (y: number): V3 => { const c = 0.8 + 0.2 * smooth(lo, hi, y); return [c, c, c]; };
  const shell: Shell = { paint: new Soup(), trim: new Soup(), ray: null as unknown as THREE.Mesh, door: { paint: new Soup(), trim: new Soup(), inner: new Soup() }, liner: new Soup() };
  const all = new Soup();
  for (const [i, j] of quads) {
    const c = corner(i, j), z = zoneOf(i, j), door = inDoor(i, j);
    const tgt = door ? (z === 'paint' ? shell.door.paint : shell.door.trim) : (z === 'paint' ? shell.paint : shell.trim);
    const uv = z === 'roof' ? cellUv('black', 0.5, 0.5) : z === 'under' ? cellUv('under', 0.5, 0.5) : ([0, 0] as P2);
    const ids = c.map(([ii, jj]) => { const p = P(ii, jj), nn = nor[ii * R + jj]; return tgt.vert(p, [nn.x, nn.y, nn.z], uv, colour(p[1])); });
    tgt.tri(ids[0], ids[2], ids[1]); tgt.tri(ids[0], ids[3], ids[2]);
    const a = c.map(([ii, jj]) => all.vert(P(ii, jj), [0, 0, 0]));
    all.tri(a[0], a[2], a[1]); all.tri(a[0], a[3], a[2]);
    // the lining: the cabin's faces turned inward, 4 cm in, dark; the door's own inner panel
    const zc = (b.zs[i] + b.zs[i + 1]) / 2;
    if ((zc > cabin[0] && zc < cabin[1] && z !== 'under') || door) {
      const dst = door ? shell.door.inner : shell.liner;
      const L = c.map(([ii, jj]) => { const p = P(ii, jj), nn = nor[ii * R + jj]; return dst.vert([p[0] - nn.x * 0.04, p[1] - nn.y * 0.04, p[2] - nn.z * 0.04], [-nn.x, -nn.y, -nn.z], cellUv('interior', 0.5, 0.5)); });
      dst.tri(L[0], L[1], L[2]); dst.tri(L[0], L[2], L[3]);
    }
  }
  shell.ray = all.mesh();
  shell.ray.geometry.computeBoundingSphere();
  return shell;
}

// ------------------------------------------------------------------------------------------------ decals
export type Frame = 'side' | 'front' | 'rear' | 'top' | { d: V3; u: V3; v: V3 };
const FRAMES: Record<string, { d: V3; u: V3; v: V3 }> = {
  side: { d: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },          // (u, v) = (z, y), seen from the +x (driver's, left) side
  front: { d: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },          // (x, y) seen from the front
  rear: { d: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },            // (x, y) seen from behind
  top: { d: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },            // (x, z) seen from above
};
export interface Decal {
  /** The outline, in the frame's (u, v), counter-clockwise or not (fixed here). */
  poly: P2[];
  frame: Frame;
  cell: string;
  /** 'fit': the cell stretched over the outline's box; 'flat': the cell's centre colour. */
  map?: 'fit' | 'flat';
  /** Lift off the surface (m): stacked layers go up by a few millimetres. */
  off?: number;
  /** Mirrored to the other side (x → −x). Default true for side and corner decals, false for centred ones. */
  mirror?: boolean;
  /** Longest triangle edge in the outline's plane before it is laid on the surface (m). */
  edge?: number;
  /** Flip the cell horizontally (a lamp drawn for the left side, used on the right). */
  flipU?: boolean;
  /** Only hits on faces whose normal leans this way are kept (dot ≥ 0.15): the side glass never lands on the roof. */
  facing?: V3;
}
/** Chaikin corner cutting: a polygon with soft corners. */
export function soft(p: P2[], iter = 2, k = 0.22): P2[] {
  let a = p;
  for (let t = 0; t < iter; t++) {
    const o: P2[] = [];
    for (let i = 0; i < a.length; i++) { const p0 = a[i], p1 = a[(i + 1) % a.length]; o.push([p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k], [p0[0] + (p1[0] - p0[0]) * (1 - k), p0[1] + (p1[1] - p0[1]) * (1 - k)]); }
    a = o;
  }
  return a;
}
/** A rounded rectangle centred at (cu, cv). */
export function rrect(cu: number, cv: number, w: number, h: number, r = 0.02, segs = 3): P2[] {
  const o: P2[] = [], hw = w / 2 - r, hh = h / 2 - r;
  const cs: [number, number, number][] = [[hw, hh, 0], [-hw, hh, Math.PI / 2], [-hw, -hh, Math.PI], [hw, -hh, Math.PI * 1.5]];
  for (const [x, y, a0] of cs) for (let i = 0; i <= segs; i++) { const a = a0 + (i / segs) * Math.PI / 2; o.push([cu + x + Math.cos(a) * r, cv + y + Math.sin(a) * r]); }
  return o;
}
export function ellipse(cu: number, cv: number, ru: number, rv: number, segs = 14): P2[] {
  return Array.from({ length: segs }, (_, i) => { const a = (i / segs) * Math.PI * 2; return [cu + Math.cos(a) * ru, cv + Math.sin(a) * rv] as P2; });
}

const ray = new THREE.Raycaster();
/** Lays a decal onto the shell: the outline triangulated and subdivided in its plane, every vertex cast along the frame's direction onto the body. */
export function decal(target: Soup, shell: THREE.Mesh, d: Decal) {
  const F = typeof d.frame === 'string' ? FRAMES[d.frame] : d.frame;
  const D = new THREE.Vector3(...F.d).normalize(), U = new THREE.Vector3(...F.u), V = new THREE.Vector3(...F.v);
  let poly = d.poly.slice();
  const area = poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (area < 0) poly = poly.reverse();
  // the outline cut by a grid of cells `edge` wide, each piece triangulated: short edges everywhere, and the pieces meet exactly along the grid lines
  const e = d.edge ?? 0.05, pts: P2[] = [], keyOf = new Map<string, number>(), faces: number[][] = [];
  const at = (p: P2) => { const k = `${Math.round(p[0] * 1e5)}_${Math.round(p[1] * 1e5)}`; let i = keyOf.get(k); if (i === undefined) { i = pts.length; pts.push(p); keyOf.set(k, i); } return i; };
  const clip = (pl: P2[], axis: 0 | 1, c: number, keepAbove: boolean): P2[] => {
    const o: P2[] = [], inside = (p: P2) => (keepAbove ? p[axis] >= c : p[axis] <= c);
    for (let i = 0; i < pl.length; i++) {
      const a = pl[i], b = pl[(i + 1) % pl.length], ia = inside(a), ib = inside(b);
      if (ia) o.push(a);
      if (ia !== ib) { const t = (c - a[axis]) / (b[axis] - a[axis]); const q: P2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; q[axis] = c; o.push(q); }
    }
    return o;
  };
  {
    let bu0 = Infinity, bu1 = -Infinity, bv0 = Infinity, bv1 = -Infinity;
    for (const [u, v] of poly) { bu0 = Math.min(bu0, u); bu1 = Math.max(bu1, u); bv0 = Math.min(bv0, v); bv1 = Math.max(bv1, v); }
    const nu = Math.max(1, Math.ceil((bu1 - bu0) / e)), nv = Math.max(1, Math.ceil((bv1 - bv0) / e));
    const gu = (k: number) => bu0 + ((bu1 - bu0) * k) / nu, gv = (k: number) => bv0 + ((bv1 - bv0) * k) / nv;
    for (let a = 0; a < nu; a++) {
      const col = clip(clip(poly, 0, gu(a), true), 0, gu(a + 1), false); if (col.length < 3) continue;
      for (let b = 0; b < nv; b++) {
        const cell = clip(clip(col, 1, gv(b), true), 1, gv(b + 1), false); if (cell.length < 3) continue;
        const ar = cell.reduce((s2, p, i) => { const q = cell[(i + 1) % cell.length]; return s2 + p[0] * q[1] - q[0] * p[1]; }, 0); if (Math.abs(ar) < 1e-9) continue;
        const ids = cell.map(at), tri = THREE.ShapeUtils.triangulateShape(cell.map(p => new THREE.Vector2(p[0], p[1])), []);
        for (const t of tri) if (ids[t[0]] !== ids[t[1]] && ids[t[1]] !== ids[t[2]] && ids[t[0]] !== ids[t[2]]) faces.push([ids[t[0]], ids[t[1]], ids[t[2]]]);
      }
    }
  }
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [u, v] of poly) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const facing = d.facing ? new THREE.Vector3(...d.facing).normalize() : null;
  const hits = pts.map(([u, v]) => {
    const o = U.clone().multiplyScalar(u).addScaledVector(V, v).addScaledVector(D, -6);
    ray.set(o, D); ray.far = 14;
    const h = ray.intersectObject(shell, false).find(x => !facing || (x.face && x.face.normal.dot(facing) >= 0.15));
    if (!h || !h.face) return null;
    const n = h.face.normal.clone();
    return { p: h.point.clone().addScaledVector(n, d.off ?? 0.006), n, uv: d.map === 'flat' ? cellUv(d.cell, 0.5, 0.5) : cellUv(d.cell, d.flipU ? 1 - (u - u0) / (u1 - u0) : (u - u0) / (u1 - u0), (v - v0) / (v1 - v0)) };
  });
  const sides = (d.mirror ?? (typeof d.frame !== 'string' || d.frame === 'side')) ? [1, -1] : [1];
  for (const sx of sides) {
    const ids = hits.map(h => h ? target.vert([h.p.x * sx, h.p.y, h.p.z], [h.n.x * sx, h.n.y, h.n.z], h.uv) : -1);
    for (const [a, b, c] of faces) {
      if (ids[a] < 0 || ids[b] < 0 || ids[c] < 0) continue;
      // wind each triangle to face the way the surface does
      const pa = hits[a]!.p, pb = hits[b]!.p, pc = hits[c]!.p, nn = hits[a]!.n.clone().add(hits[b]!.n).add(hits[c]!.n);
      const fn = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa));
      const out = fn.dot(nn) >= 0;
      if (out === (sx > 0)) target.tri(ids[a], ids[b], ids[c]); else target.tri(ids[a], ids[c], ids[b]);
    }
  }
}

// ------------------------------------------------------------------------------------------------ wheels
export interface WheelStyle { spokes: number; twin?: boolean; rim: string; face?: string; rimShare: number; /** Spoke width at the hub / at the rim (rad). */ wIn: number; wOut: number; dish: number; /** The calliper's cell (none: no calliper). */ caliper?: string }
/**
 * One wheel, axle along x, outer face toward +x (`side` −1 builds the right-hand one, its face toward −x): the tyre turned about the axle,
 * the rim's face with its spoke windows (the dark brake disc and calliper behind them), a lip.
 */
export function wheel(r: number, width: number, st: WheelStyle, side: 1 | -1): Soup {
  const s = new Soup(), w = width / 2, rr = r * st.rimShare, SEG = 22;
  // tyre: a profile turned about x
  const prof: P2[] = [[rr * 0.98, -w * 0.9], [r * 0.9, -w], [r * 0.985, -w * 0.82], [r, -w * 0.45], [r, w * 0.45], [r * 0.985, w * 0.82], [r * 0.9, w], [rr * 0.98, w * 0.9]];
  const ring: number[][] = [];
  for (let k = 0; k <= SEG; k++) {
    const a = (k / SEG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    ring.push(prof.map(([rad, ax], pi) => {
      const prev = prof[Math.max(0, pi - 1)], next = prof[Math.min(prof.length - 1, pi + 1)];
      const tr = next[0] - prev[0], ta = next[1] - prev[1], nl = Math.hypot(tr, ta) || 1, nr = ta / nl, nax = -tr / nl;   // the profile's normal (outward)
      return s.vert([ax * side, rad * ca, rad * sa], [nax * side, nr * ca, nr * sa], cellUv('tyre', 0.5, 0.5));
    }));
  }
  for (let k = 0; k < SEG; k++) for (let p = 0; p < prof.length - 1; p++) {
    const a = ring[k][p], b = ring[k + 1][p], c = ring[k + 1][p + 1], d = ring[k][p + 1];
    if (side > 0) { s.tri(a, b, c); s.tri(a, c, d); } else { s.tri(a, c, b); s.tri(a, d, c); }
  }
  const faceX = w * 0.72 * side;
  const disc = (x: number, rad: number, cell: string, segs: number, toward: number) => {
    const c = s.vert([x, 0, 0], [toward, 0, 0], cellUv(cell, 0.5, 0.5)); const ids: number[] = [];
    for (let k = 0; k < segs; k++) { const a = (k / segs) * Math.PI * 2; ids.push(s.vert([x, rad * Math.cos(a), rad * Math.sin(a)], [toward, 0, 0], cellUv(cell, 0.5, 0.5))); }
    for (let k = 0; k < segs; k++) { const a = ids[k], b = ids[(k + 1) % segs]; if (toward > 0) s.tri(c, a, b); else s.tri(c, b, a); }
  };
  // behind the spokes: the dark barrel / brake disc, and the calliper at the rear of it; the tyre's inner side closed
  disc(w * 0.05 * side, rr * 0.99, 'disc', 18, side);
  disc(-w * 0.9 * side, rr * 0.99, 'under', 12, -side);
  if (st.caliper) {                                                                   // a small block gripping the disc at its rear, above the axle
    const th = 2.3, cal = new THREE.BoxGeometry(0.045, rr * 0.34, rr * 0.2); cal.rotateX(-(th - Math.PI / 2));
    cal.translate(w * 0.32 * side, rr * 0.68 * Math.sin(th), rr * 0.68 * Math.cos(th)); s.append(Soup.from(cal, cellUv(st.caliper, 0.5, 0.5)));
  }
  // the rim's face: an annulus with N windows, dished (the centre set in)
  const outer: THREE.Vector2[] = [], N = st.spokes, OUT = 40;
  for (let k = 0; k < OUT; k++) { const a = (k / OUT) * Math.PI * 2; outer.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr)); }
  const holes: THREE.Vector2[][] = [], rIn = rr * 0.3, rOut = rr * 0.86;
  const windows = st.twin ? N * 2 : N;
  for (let i = 0; i < windows; i++) {
    const gap = st.twin ? (i % 2 === 0 ? 1.7 : 0.3) : 1;                       // twin spokes: a wide window, then a narrow slot between the pair
    const step = (Math.PI * 2) / N, base = st.twin ? Math.floor(i / 2) * step + (i % 2 ? step * 0.85 : 0) : i * step;
    const span = st.twin ? step * (i % 2 ? 0.15 : 0.85) : step;
    const aIn0 = base + st.wIn / 2, aIn1 = base + span - st.wIn / 2, aOut0 = base + st.wOut / 2 * (gap > 1 ? 1 : 0.6), aOut1 = base + span - st.wOut / 2 * (gap > 1 ? 1 : 0.6);
    if (aIn1 <= aIn0 || aOut1 <= aOut0) continue;
    const h: THREE.Vector2[] = [];
    for (let k = 0; k <= 5; k++) { const a = aOut0 + (aOut1 - aOut0) * (k / 5); h.push(new THREE.Vector2(Math.cos(a) * rOut, Math.sin(a) * rOut)); }
    for (let k = 2; k >= 0; k--) { const a = aIn0 + (aIn1 - aIn0) * (k / 2); h.push(new THREE.Vector2(Math.cos(a) * rIn * 1.25, Math.sin(a) * rIn * 1.25)); }
    holes.push(h.reverse());
  }
  const shape = new THREE.Shape(outer); for (const h of holes) shape.holes.push(new THREE.Path(h));
  const sg = new THREE.ShapeGeometry(shape, 4); const pp = sg.attributes.position;
  const face = st.face ?? st.rim;
  const fIds: number[] = [];
  for (let k = 0; k < pp.count; k++) {
    const y = pp.getX(k), z = pp.getY(k), rho = Math.hypot(y, z) / rr;
    const x = faceX - st.dish * (1 - rho) * side;
    fIds.push(s.vert([x, y, z], [side, 0, 0], cellUv(rho > 0.86 ? st.rim : face, 0.5, 0.5)));
  }
  const ix = sg.index!;
  for (let k = 0; k < ix.count; k += 3) { const a = fIds[ix.getX(k)], b = fIds[ix.getX(k + 1)], c = fIds[ix.getX(k + 2)]; if (side > 0) s.tri(a, b, c); else s.tri(a, c, b); }
  // the hub cap: a small disc proud of the centre
  disc(faceX - st.dish * 0.75 * side + 0.004 * side, rIn * 0.75, st.rim, 10, side);
  return s;
}

/** A small box as a soup (mirror caps, handles, seats). */
export function box(c: V3, size: V3, cell: string, rotY = 0, rotX = 0): Soup {
  const g = new THREE.BoxGeometry(...size); g.rotateX(rotX); g.rotateY(rotY); g.translate(...c);
  return Soup.from(g, cellUv(cell, 0.5, 0.5));
}
/** A squashed sphere (a mirror's housing). */
export function blob(c: V3, size: V3, cell: string, ws = 8, hs = 6): Soup {
  const g = new THREE.SphereGeometry(0.5, ws, hs); g.scale(...size); g.translate(...c);
  return Soup.from(g, cellUv(cell, 0.5, 0.5));
}
