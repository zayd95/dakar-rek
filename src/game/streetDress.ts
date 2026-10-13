import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameModule } from './modules';
import type { HubWorld } from '../world/types';
import type { HubId } from '../core/types';
import { rng } from '../core/rng';
import { linesOf, stopOnLeg } from '../transport/lines';
import { HUB_STREETS, edgeWeight } from '../crowd/streetPlan';

/**
 * Dakar's street furniture on the main roads, merged into ONE draw call per hub (one atlas texture for every sign):
 * the occupied pavement (parasol stalls with a table and stool, the wooden « cantines » with a hand-painted sign, a
 * vendor's barrow of fruit at the kerb), a few roadside billboards (invented advertisers only, French and Wolof) and
 * the blue street-name plates at the corners. Placed from the hub seed, most along the busy streets, kept clear of
 * crossings, stops, the car rapide station, places people use and the arena gate; every solid piece gets a collider
 * that leaves the pavement lanes of the street crowd (src/crowd/streetPlan.ts PAVE) free.
 */
export const DRESS_COUNT = {
  low: { stalls: 10, cantines: 5, barrows: 2, boards: 2, plates: 4 },
  medium: { stalls: 16, cantines: 8, barrows: 3, boards: 3, plates: 6 },
  high: { stalls: 22, cantines: 11, barrows: 4, boards: 5, plates: 8 },
} as const;

// ------------------------------------------------------------------------------------------------ the sign atlas
const AW = 1024, AH = 1024;
const CELL = { w: 256, h: 80 };
const BOARDS: { big: string; sub: string; bg: string; fg: string; accent: string }[] = [
  { big: 'WAXTAAN MOBILE', sub: 'Forfait 4G illimité · 2 000 F / semaine', bg: '#e08a2c', fg: '#fff6e0', accent: '#7a2d0e' },
  { big: 'TERRAIN À VENDRE', sub: '300 m² · titre foncier · 77 000 00 00', bg: '#f1ead2', fg: '#1f4d2b', accent: '#b8442e' },
  { big: 'BOUILLON YAAKAAR', sub: 'Le goût de chez nous', bg: '#c23b2a', fg: '#ffe9a8', accent: '#f2c744' },
  { big: 'SAVON LÉER', sub: 'Propre, net, jàmm !', bg: '#3d7fb0', fg: '#f6f9fb', accent: '#f2c744' },
];
const WALL: { t: string; s?: string; bg: string; fg: string }[] = [
  { t: 'ALIMENTATION', s: 'GÉNÉRALE', bg: '#d8b24a', fg: '#2b1d10' },
  { t: 'MULTISERVICES', bg: '#4f8f8a', fg: '#fdf6e4' },
  { t: 'COUTURE', s: 'Modèles sur mesure', bg: '#b4533c', fg: '#fdf0d4' },
  { t: 'TÉLÉCENTRE', s: 'Crédit · Transfert', bg: '#e9e1c8', fg: '#a1321f' },
  { t: 'BOUTIQUE', bg: '#5c8a4f', fg: '#fdf6e4' },
  { t: 'QUINCAILLERIE', bg: '#3f6f9e', fg: '#fdf6e4' },
  { t: 'COIFFURE', s: 'Hommes · Dames', bg: '#7b4a8a', fg: '#fdf3d8' },
  { t: 'CYBER · IMPRESSION', bg: '#2f2f35', fg: '#f4d35e' },
];
const PLATES: Record<HubId, string[]> = {
  plateau: ['RUE SANDAGA', 'RUE 11 × RUE 24', 'AV. DE LA LIBERTÉ', 'RUE DU MARCHÉ'],
  pikine: ['GRAND-RUE DE PIKINE', 'RUE 22 · PIKINE', 'AV. DES PARCELLES', 'RUE DE L’ARÈNE'],
  corniche: ['CORNICHE OUEST', 'RUE DU PHARE', 'ROUTE DE LA CORNICHE', 'RUE DES PÊCHEURS'],
  almadies: ['ROUTE DES ALMADIES', 'RUE DES NGOR', 'AV. DU LITTORAL', 'RUE DES VILLAS'],
};
type Rect = [number, number, number, number];                       // u0, v0, u1, v1
let atlas: { tex: THREE.CanvasTexture; glow: THREE.CanvasTexture; board: Rect[]; wall: Rect[]; plate: Record<string, Rect[]>; white: Rect } | null = null;
const rectOf = (x: number, y: number, w: number, h: number): Rect => [x / AW, 1 - (y + h) / AH, (x + w) / AW, 1 - y / AH];
function fit(c: CanvasRenderingContext2D, text: string, w: number, size: number, weight = 800) {
  c.font = `${weight} ${size}px system-ui, "Arial Narrow", sans-serif`;
  while (c.measureText(text).width > w && size > 10) { size -= 2; c.font = `${weight} ${size}px system-ui, "Arial Narrow", sans-serif`; }
}
function dressAtlas() {
  if (atlas) return atlas;
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff'; c.fillRect(0, 0, AW, AH);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const board: Rect[] = [], wall: Rect[] = [], plate: Record<string, Rect[]> = {};
  BOARDS.forEach((b, i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
    c.fillStyle = b.bg; c.fillRect(x, y, 512, 256);
    c.fillStyle = b.accent; c.fillRect(x, y + 196, 512, 60); c.fillRect(x, y, 512, 14);
    c.fillStyle = b.fg; fit(c, b.big, 470, 64); c.fillText(b.big, x + 256, y + 86);
    fit(c, b.sub, 480, 26, 700); c.fillStyle = i === 1 ? '#fff' : b.fg; c.fillText(b.sub, x + 256, y + 226);
    c.fillStyle = b.accent; c.beginPath(); c.arc(x + 256, y + 150, 22, 0, Math.PI * 2); c.fill();   // a round mark under the name
    board.push(rectOf(x, y, 512, 256));
  });
  WALL.forEach((s, i) => {
    const x = (i % 4) * CELL.w, y = 512 + Math.floor(i / 4) * CELL.h;
    c.fillStyle = s.bg; c.fillRect(x, y, CELL.w, CELL.h);
    c.strokeStyle = s.fg; c.lineWidth = 3; c.strokeRect(x + 5, y + 5, CELL.w - 10, CELL.h - 10);   // hand-painted frame
    c.fillStyle = s.fg;
    if (s.s) { fit(c, s.t, CELL.w - 28, 34); c.fillText(s.t, x + CELL.w / 2, y + 28); fit(c, s.s, CELL.w - 28, 22, 700); c.fillText(s.s, x + CELL.w / 2, y + 58); }
    else { fit(c, s.t, CELL.w - 28, 40); c.fillText(s.t, x + CELL.w / 2, y + CELL.h / 2 + 2); }
    wall.push(rectOf(x, y, CELL.w, CELL.h));
  });
  let k = 0;
  for (const hub of Object.keys(PLATES) as HubId[]) {
    plate[hub] = PLATES[hub].map(t => {
      const x = (k % 4) * CELL.w, y = 672 + Math.floor(k / 4) * CELL.h; k++;
      c.fillStyle = '#1f5c9e'; c.fillRect(x, y, CELL.w, CELL.h);                                    // blue enamel plate, white letters
      c.strokeStyle = '#f4f6f8'; c.lineWidth = 3; c.strokeRect(x + 4, y + 4, CELL.w - 8, CELL.h - 8);
      c.fillStyle = '#f4f6f8'; fit(c, t, CELL.w - 26, 30); c.fillText(t, x + CELL.w / 2, y + CELL.h / 2 + 2);
      return rectOf(x, y, CELL.w, CELL.h);
    });
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // the night glow: the signs only (the plain parts of the pieces sample the white cell: black here)
  const cg = document.createElement('canvas'); cg.width = AW; cg.height = AH;
  const g2 = cg.getContext('2d')!; g2.drawImage(cv, 0, 0); g2.fillStyle = '#000'; g2.fillRect(992, 992, 32, 32);
  const glow = new THREE.CanvasTexture(cg); glow.colorSpace = THREE.SRGBColorSpace;
  atlas = { tex, glow, board, wall, plate, white: rectOf(1000, 1000, 16, 16) };
  return atlas;
}

// ------------------------------------------------------------------------------------------------ merged pieces
class Pieces {
  geos: THREE.BufferGeometry[] = [];
  constructor(private white: Rect) {}
  private put(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rotY: number, rotX = 0) {
    g.rotateX(rotX); g.rotateY(rotY); g.translate(x, y, z);
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count, col = new THREE.Color(color), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
  }
  private plain(g: THREE.BufferGeometry) {
    const n = g.attributes.position.count, uv = new Float32Array(n * 2), [u0, v0, u1, v1] = this.white;
    for (let i = 0; i < n; i++) { uv[i * 2] = (u0 + u1) / 2; uv[i * 2 + 1] = (v0 + v1) / 2; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
  /** Box with its base at y. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rotY = 0) {
    const g = this.plain(new THREE.BoxGeometry(w, h, d)); g.translate(0, h / 2, 0); this.put(g, color, x, y, z, rotY);
  }
  /** Box whose +z face carries the atlas rect (a sign board). */
  board(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rect: Rect, rotY = 0) {
    const g = this.plain(new THREE.BoxGeometry(w, h, d));
    const uv = g.attributes.uv as THREE.BufferAttribute, [u0, v0, u1, v1] = rect;
    const pz = 4 * 4;                                                           // BoxGeometry face order: px nx py ny pz nz
    uv.setXY(pz, u0, v1); uv.setXY(pz + 1, u1, v1); uv.setXY(pz + 2, u0, v0); uv.setXY(pz + 3, u1, v0);
    g.translate(0, h / 2, 0); this.put(g, color, x, y, z, rotY);
  }
  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: number, seg = 8, rotX = 0, yaw = 0) {
    const g = this.plain(new THREE.CylinderGeometry(rTop, rBot, h, seg)); g.translate(0, h / 2, 0);
    this.put(g, color, x, y, z, yaw, rotX);
  }
  /** A parasol: a shallow cone in two alternating colours (per triangle), on a pole. */
  parasol(x: number, y: number, z: number, r: number, c1: number, c2: number) {
    const g = new THREE.ConeGeometry(r, 0.42, 8, 1, true); g.translate(0, 0.21, 0);
    const ng = g.toNonIndexed(); this.plain(ng);
    const n = ng.attributes.position.count, arr = new Float32Array(n * 3), a = new THREE.Color(c1), b = new THREE.Color(c2);
    for (let i = 0; i < n; i++) { const col = Math.floor(i / 3) % 2 ? a : b; arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    ng.translate(x, y, z); this.geos.push(ng);
  }
}

const SUN = [0xe0a24a, 0xc8654a, 0x5f9aa8, 0x8bb26e, 0xe4cf9a, 0xb86a8c, 0xd9d2bc];     // sun-faded, not saturated
const GOODS = [0xe58a2f, 0xb8372b, 0x6aa84f, 0xe8c24a, 0xefe9da, 0x7a4a2a];

interface Spot { x: number; z: number; dx: number; dz: number; nx: number; nz: number; yaw: number }

/** The module: dresses the main roads of the hub that loads (one merged mesh and a few colliders). */
let current: { mesh: THREE.Mesh | null; geo: THREE.BufferGeometry | null } | null = null;

export function dressHub(hub: HubWorld, q: keyof typeof DRESS_COUNT, extraAvoid: readonly { x: number; z: number }[] = []): { mesh: THREE.Mesh | null; items: { kind: string; x: number; z: number }[] } {
  const N = DRESS_COUNT[q], A = dressAtlas();
  const R = rng(0xd4c0 + hub.id.length * 313 + Math.round(hub.spawn.x * 7 - hub.spawn.z * 5));
  const P = new Pieces(A.white);
  const items: { kind: string; x: number; z: number }[] = [];
  const busyStreets = HUB_STREETS[hub.id]?.busy ?? [];
  const gate = hub.arena ? { x: hub.arena.cx, z: hub.arena.cz - 30 } : null;
  const stops: { x: number; z: number }[] = [];
  for (const line of linesOf(hub.id)) for (const def of line.stops) { const l = stopOnLeg(line, def); stops.push({ x: l.x, z: l.z }); }
  const taken: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const free = (r: { x0: number; z0: number; x1: number; z1: number }) =>
    !hub.colliders.some(c => r.x0 < c.x1 + 0.05 && r.x1 > c.x0 - 0.05 && r.z0 < c.z1 + 0.05 && r.z1 > c.z0 - 0.05) && !taken.some(c => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0);
  const ok = (x: number, z: number, nodeClear = 12) => {
    if (x < hub.bounds.x0 + 6 || x > hub.bounds.x1 - 6 || z < hub.bounds.z0 + 6 || z > hub.bounds.z1 - 6) return false;
    if (Math.hypot(hub.spawn.x - x, hub.spawn.z - z) < 9) return false;
    if (gate && Math.hypot(gate.x - x, gate.z - z) < 46) return false;
    if (stops.some(s => Math.hypot(s.x - x, s.z - z) < 13) || extraAvoid.some(s => Math.hypot(s.x - x, s.z - z) < 8)) return false;
    if (hub.interactables.some(i => Math.hypot(i.x - x, i.z - z) < 5.5) || hub.rapides.some(o => Math.hypot(o.position.x - x, o.position.z - z) < 10)) return false;
    if (hub.seats.some(s => Math.hypot(s.x - x, s.z - z) < 3)) return false;
    return !hub.nodes.some(row => row.some(n => Math.abs(n.x - x) < nodeClear && Math.abs(n.z - z) < nodeClear));   // not in crossings
  };
  // places along the kerbs, the busy streets first
  const places: { e: number; side: 1 | -1; t: number; w: number; main: boolean }[] = [];
  hub.edges.forEach((e, ei) => {
    const len = Math.hypot(e.bx - e.ax, e.bz - e.az); if (len < 30) return;
    const main = edgeWeight(e, busyStreets) > 1, w = main ? 12 : Math.hypot((e.ax + e.bx) / 2 - hub.spawn.x, (e.az + e.bz) / 2 - hub.spawn.z) < 90 ? 3 : 1;
    for (const side of [1, -1] as const) for (let t = 13; t <= len - 13; t += 5.5) places.push({ e: ei, side, t: t + (R() - 0.5) * 2, w: w * (0.5 + R()), main });
  });
  const draw = (mainFirst: boolean): { spot: Spot; edge: number } | null => {
    if (!places.length) return null;
    const wOf = (p: { w: number; main: boolean }) => mainFirst && !p.main ? p.w * 0.02 : p.w;     // the first 70 % go to the busy streets
    let sum = 0; for (const p of places) sum += wOf(p);
    let u = R() * sum, k = 0; for (; k < places.length - 1; k++) { u -= wOf(places[k]); if (u <= 0) break; }
    const p = places.splice(k, 1)[0], e = hub.edges[p.e], len = Math.hypot(e.bx - e.ax, e.bz - e.az);
    const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len, nx = -dz * p.side, nz = dx * p.side, t = p.t / len;
    // (nx, nz): from the centre line towards this pavement
    return { spot: { x: e.ax + (e.bx - e.ax) * t, z: e.az + (e.bz - e.az) * t, dx, dz, nx, nz, yaw: Math.atan2(-nx, -nz) }, edge: p.e };
  };
  /** Rect of a footprint `along` × `deep` centred `off` from the centre line. */
  const foot = (s: Spot, off: number, along: number, deep: number) => {
    const cx = s.x + s.nx * off, cz = s.z + s.nz * off, ex = Math.abs(s.dx) * along / 2 + Math.abs(s.nx) * deep / 2, ez = Math.abs(s.dz) * along / 2 + Math.abs(s.nz) * deep / 2;
    return { cx, cz, r: { x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez } };
  };
  /** Local frame helper: a piece at (a along, b towards the pavement back, y) of the spot at `off`. */
  const at = (s: Spot, off: number, a: number, b: number) => ({ x: s.x + s.nx * (off + b) + s.dx * a, z: s.z + s.nz * (off + b) + s.dz * a });
  const place = (n: number, build: (s: Spot) => { r: { x0: number; x1: number; z0: number; z1: number }; h: number } | null, kind: string) => {
    let done = 0, tries = 0;
    while (done < n && places.length && tries++ < n * 60) {
      const d = draw(done < n * 0.7); if (!d) break;
      const res = build(d.spot);
      if (!res) continue;
      taken.push(res.r); hub.colliders.push({ ...res.r, h: res.h });
      items.push({ kind, x: (res.r.x0 + res.r.x1) / 2, z: (res.r.z0 + res.r.z1) / 2 }); done++;
    }
  };
  const rot = (s: Spot) => Math.atan2(-s.nx, -s.nz);                       // facing the road

  // parasol stalls: a table with goods and a stool under a big parasol, at the back of the pavement
  place(N.stalls, s => {
    const off = 6.5, f = foot(s, off, 1.7, 0.95);
    if (!ok(f.cx, f.cz) || !free(f.r)) return null;
    const y = 0.12, yaw = rot(s), c1 = SUN[Math.floor(R() * SUN.length)], c2 = R() < 0.5 ? 0xf0ead8 : SUN[Math.floor(R() * SUN.length)];
    P.box(1.5, 0.78, 0.8, f.cx, y, f.cz, 0x8a6a48, yaw);
    for (let n = 0; n < 5; n++) { const p = at(s, off, -0.55 + n * 0.28, 0); P.box(0.24, 0.2, 0.26, p.x, y + 0.78, p.z, GOODS[Math.floor(R() * GOODS.length)], yaw); }
    const pole = at(s, off, 0.9, 0.35); P.cyl(0.035, 0.035, 2.3, pole.x, y, pole.z, 0x4a4a4a, 5);
    P.parasol(pole.x, y + 2.15, pole.z, 1.25, c1, c2);
    const st = at(s, off, -0.5, -0.8); P.box(0.36, 0.38, 0.36, st.x, y, st.z, 0x3a5fa0, yaw);
    return { r: f.r, h: 1 };
  }, 'stall');

  // cantines: a small painted wooden shop, its hand-painted sign on the front
  place(N.cantines, s => {
    const off = 6.62, f = foot(s, off, 2.1, 1.1);
    if (!ok(f.cx, f.cz, 14) || !free(f.r)) return null;
    const y = 0.12, yaw = rot(s), body = SUN[Math.floor(R() * SUN.length)];
    P.box(1.9, 2.1, 1.1, f.cx, y, f.cz, body, yaw);
    const front = at(s, off, 0, -0.56), sign = A.wall[Math.floor(R() * A.wall.length)];
    P.board(1.7, 0.55, 0.06, front.x, y + 1.55, front.z, 0xffffff, sign, yaw);
    const awn = at(s, off, 0, -0.95); P.box(2.1, 0.07, 0.8, awn.x, y + 1.35, awn.z, 0xefe7d3, yaw);
    const cnt = at(s, off, 0, -0.62); P.box(1.5, 0.12, 0.4, cnt.x, y + 0.85, cnt.z, 0x6b4a2e, yaw);
    return { r: f.r, h: 2.1 };
  }, 'cantine');

  // a vendor's barrow of fruit at the road edge (two wheels, a pile, a parasol), clear of the pavement lane
  place(N.barrows, s => {
    const off = 4.45, f = foot(s, off, 1.9, 0.75);
    if (!ok(f.cx, f.cz, 14) || !free(f.r)) return null;
    const y = 0.08, yaw = rot(s);
    P.box(1.5, 0.12, 0.7, f.cx, y + 0.55, f.cz, 0x7a5636, yaw);
    for (const sx of [-1, 1]) { const w = at(s, off, 0.1, sx * 0.4); P.cyl(0.3, 0.3, 0.07, w.x, y + 0.3, w.z, 0x222222, 10, Math.PI / 2, yaw); }
    for (let n = 0; n < 6; n++) { const p = at(s, off, -0.5 + (n % 3) * 0.5, (n < 3 ? -1 : 1) * 0.15); P.box(0.38, 0.24, 0.3, p.x, y + 0.67, p.z, n % 2 ? 0xe58a2f : 0xd9b43a, yaw); }
    const h1 = at(s, off, -1.2, 0), h2 = at(s, off, -1.7, 0); P.box(0.7, 0.06, 0.06, h1.x, y + 0.85, h1.z, 0x5a3f26, yaw); P.box(0.04, 0.4, 0.04, h2.x, y + 0.5, h2.z, 0x5a3f26, yaw);
    const pole = at(s, off, 0.7, 0); P.cyl(0.03, 0.03, 1.9, pole.x, y + 0.6, pole.z, 0x4a4a4a, 5);
    P.parasol(pole.x, y + 2.4, pole.z, 1.05, 0xe4cf9a, 0xb8442e);
    return { r: f.r, h: 0.9 };
  }, 'barrow');

  // roadside billboards: two posts behind the pavement, the board facing the road (invented advertisers)
  place(N.boards, s => {
    const off = 6.6, f = foot(s, off, 5.0, 0.4);
    if (!ok(f.cx, f.cz, 16) || !free(f.r)) return null;
    const y = 0.12, yaw = rot(s), ad = A.board[Math.floor(R() * A.board.length)];
    for (const a of [-1.9, 1.9]) { const p = at(s, off, a, 0); P.box(0.22, 3.7, 0.22, p.x, y, p.z, 0x55585c, yaw); }
    P.board(4.8, 2.3, 0.18, f.cx, y + 3.55, f.cz, 0xffffff, ad, yaw);
    // only the posts are solid (the pavement under the board is walkable)
    const px = at(s, off, -1.9, 0), qx = at(s, off, 1.9, 0);
    const post = (p: { x: number; z: number }) => ({ x0: p.x - 0.18, x1: p.x + 0.18, z0: p.z - 0.18, z1: p.z + 0.18 });
    const r0 = post(px), r1 = post(qx);
    hub.colliders.push({ ...r0, h: 5 }, { ...r1, h: 5 });
    return { r: { x0: f.r.x0, x1: f.r.x0 + 0.001, z0: f.r.z0, z1: f.r.z0 + 0.001 }, h: 0.01 };
  }, 'board');

  // street-name plates: a post at a pavement corner with a blue plate each way
  const plates = A.plate[hub.id] ?? A.plate.plateau;
  const corners: { x: number; z: number; d: number }[] = [];
  for (const row of hub.nodes) for (const n of row) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = n.x + sx * 6.4, z = n.z + sz * 6.4;
    corners.push({ x, z, d: Math.hypot(x - hub.spawn.x, z - hub.spawn.z) + R() * 40 });
  }
  corners.sort((a, b) => a.d - b.d);
  let np = 0;
  for (const c of corners) {
    if (np >= N.plates) break;
    if (!ok(c.x, c.z, 0) ) continue;
    const r = { x0: c.x - 0.12, x1: c.x + 0.12, z0: c.z - 0.12, z1: c.z + 0.12 };
    if (!free(r) || items.some(i => Math.hypot(i.x - c.x, i.z - c.z) < 5)) continue;
    const y = 0.12;
    P.box(0.1, 2.9, 0.1, c.x, y, c.z, 0x4a4d52);
    const rect = plates[np % plates.length];
    // one plate along each road meeting at the corner (the plate's face looks along the road, towards whoever walks it)
    P.board(1.0, 0.32, 0.04, c.x, y + 2.45, c.z + 0.07, 0xffffff, rect, 0);
    P.board(1.0, 0.32, 0.04, c.x, y + 2.45, c.z - 0.07, 0xffffff, rect, Math.PI);
    P.board(1.0, 0.32, 0.04, c.x + 0.07, y + 2.1, c.z, 0xffffff, plates[(np + 1) % plates.length], Math.PI / 2);
    P.board(1.0, 0.32, 0.04, c.x - 0.07, y + 2.1, c.z, 0xffffff, plates[(np + 1) % plates.length], -Math.PI / 2);
    taken.push(r); hub.colliders.push({ ...r, h: 2.9 }); items.push({ kind: 'plate', x: c.x, z: c.z }); np++;
  }

  if (!P.geos.length) return { mesh: null, items };
  const geo = mergeGeometries(P.geos, false)!;
  for (const g of P.geos) g.dispose();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: A.tex, vertexColors: true, emissive: 0xffffff, emissiveMap: A.glow, emissiveIntensity: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'street_dress'; mesh.castShadow = q !== 'low'; mesh.receiveShadow = false;
  hub.signs.push(mesh);                                                      // lit a little at night with the shop signs (main.ts)
  return { mesh, items };
}

export const streetDressModule: GameModule = {
  name: 'streetDress',
  hubLoaded(ctx, hub) {
    if (current) { current.mesh?.removeFromParent(); current.geo?.dispose(); (current.mesh?.material as THREE.Material | undefined)?.dispose(); current = null; }
    const r = dressHub(hub, ctx.quality());
    if (r.mesh) { ctx.extra.add(r.mesh); current = { mesh: r.mesh, geo: r.mesh.geometry }; }
    streetItems = r.items;
  },
  debug: ctx => ({
    streetDress: () => streetItems,
    /** What stands in a window of the hub (checks, tuning): the car rapides, the places, the low colliders. */
    streetBlockers(x0: number, x1: number, z0: number, z1: number) {
      const w = ctx.world()!, inb = (x: number, z: number) => x > x0 && x < x1 && z > z0 && z < z1;
      return {
        rapides: w.rapides.map(o => [o.position.x, o.position.z]).filter(([x, z]) => inb(x, z)),
        places: w.interactables.filter(i => inb(i.x, i.z)).map(i => [i.name, i.x, i.z]),
        colliders: w.colliders.filter(c => c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1 && true).map(c => [c.x0, c.x1, c.z0, c.z1, c.h]),
        spawn: w.spawn,
      };
    },
  }),
};
let streetItems: { kind: string; x: number; z: number }[] = [];
