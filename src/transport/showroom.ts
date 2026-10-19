import * as THREE from 'three';
import type { Collider } from '../world/types';

/**
 * The glass front of a car dealer, added to a dealer's site (src/transport/ownedModule.ts buildDealer). Two looks on one builder, no new system:
 *  - `ndiaye`: Ndiaye Auto's open used-car showroom (src/world/shopKit.ts `showroom_cars`) gets a glass front with an open entrance, a lit
 *    fascia sign, a canopy over the pavement and a tall blade sign at the corner that reads from down the street;
 *  - `prestige`: Prestige Auto's two cars each stand in a glass pavilion: a stone platform, a dark roof slab with a gold light line, a charcoal
 *    back wall with the price plaques, a plinth under each car and a tall black pylon with the name.
 * Drawn in the street's own frame: `n` points toward the street, `a` runs along the front, `d` is the depth behind the front line.
 */
export interface ShowroomSpec {
  style: 'ndiaye' | 'prestige';
  /** The middle of the street-side line of the building (world). */
  origin: { x: number; z: number };
  /** Unit vector toward the street (axis-aligned). */
  n: { x: number; z: number };
  /** The front's extent along `a` from `origin` (negative…positive). */
  a0: number; a1: number;
  /** Depth of the building behind the front line. */
  depth: number;
  /** Openings of the glass, along `a`. */
  gaps: [number, number][];
  /** Where the tall sign stands, along `a`. */
  tower: number;
  /** The cars on show (world), for their plinths and plaques. */
  displays?: { x: number; z: number }[];
}
export interface ShowroomBrand {
  /** « NDIAYE AUTO » (the blade stacks its words). */
  title: string;
  /** « VOITURES · Plateau » (the fascia shows it whole, the blade on two lines). */
  sub: string;
  bg: string; band: string; fg: string;
  /** Name and price on the plaques seen from the street (the catalogue's). */
  plaque?: { name: string; price: string };
}

type Mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => THREE.Mesh;

const HEIGHT = 3.3;                       // the glass
const std = (color: number) => new THREE.MeshLambertMaterial({ color });
const glow = (color: number) => new THREE.MeshBasicMaterial({ color });

function canvas(w: number, h: number) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); return c ? { cv, c } : null;
}
const texOf = (cv: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

/** The fascia: the name big, a line under it, a band of the accent colour above and below. */
function fasciaTex(b: ShowroomBrand): THREE.CanvasTexture | null {
  const k = canvas(1536, 224); if (!k) return null;
  const { cv, c } = k, w = cv.width, h = cv.height;
  c.fillStyle = b.bg; c.fillRect(0, 0, w, h);
  c.fillStyle = b.band; c.fillRect(0, 0, w, 14); c.fillRect(0, h - 14, w, 14);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = b.fg; c.font = '900 112px system-ui, sans-serif'; c.fillText(b.title, w / 2, h * 0.42, w * 0.94);
  c.fillStyle = b.band; c.font = '800 44px system-ui, sans-serif'; c.fillText(b.sub, w / 2, h * 0.8, w * 0.9);
  return texOf(cv);
}

/** The blade: the name stacked, the kind of cars, the district. */
function bladeTex(b: ShowroomBrand): THREE.CanvasTexture | null {
  const k = canvas(320, 800); if (!k) return null;
  const { cv, c } = k, w = cv.width, h = cv.height;
  c.fillStyle = b.bg; c.fillRect(0, 0, w, h);
  c.fillStyle = b.band; c.fillRect(0, 0, w, 20); c.fillRect(0, h - 20, w, 20);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const words = b.title.split(' ');
  words.forEach((t, i) => { c.fillStyle = i === 0 ? b.fg : b.band; c.font = '900 104px system-ui, sans-serif'; c.fillText(t, w / 2, 130 + i * 120, w * 0.92); });
  const [kind, where] = b.sub.split(' · ');
  c.fillStyle = b.fg; c.font = '800 60px system-ui, sans-serif'; c.fillText((kind ?? '').toUpperCase(), w / 2, 130 + words.length * 120 + 50, w * 0.9);
  c.fillStyle = b.band; c.font = '700 46px system-ui, sans-serif'; c.fillText(where ?? '', w / 2, h - 80, w * 0.9);
  return texOf(cv);
}

/** The price plaque: the model's name and its catalogue price, large. */
function plaqueTex(b: ShowroomBrand): THREE.CanvasTexture | null {
  if (!b.plaque) return null;
  const k = canvas(512, 256); if (!k) return null;
  const { c } = k;
  c.fillStyle = b.bg; c.fillRect(0, 0, 512, 256);
  c.strokeStyle = b.band; c.lineWidth = 8; c.strokeRect(10, 10, 492, 236);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = b.fg; c.font = '800 48px system-ui, sans-serif'; c.fillText(b.plaque.name.toUpperCase(), 256, 78, 460);
  c.fillStyle = b.band; c.font = '900 76px system-ui, sans-serif'; c.fillText(b.plaque.price, 256, 158, 470);
  c.fillStyle = b.fg; c.font = '700 28px system-ui, sans-serif'; c.fillText('ESSAI GRATUIT · PRIX FIXE', 256, 218, 460);
  return texOf(k.cv);
}

/** Builds the front. `textures` collects what must be disposed with the dealer; solid parts are added to `colliders`. */
export function buildShowroom(spec: ShowroomSpec, brand: ShowroomBrand, mesh: Mesh, colliders: Collider[], textures: THREE.Texture[]) {
  const n = spec.n, av = { x: -n.z, z: n.x }, yaw = Math.atan2(-av.z, av.x);
  // a box's local +x runs along `a` and its local +z away from the street (into the building): its street face is the −z one (index 5)
  const ndiaye = spec.style === 'ndiaye';
  const navy = parseInt(brand.bg.slice(1), 16), gold = parseInt(brand.band.slice(1), 16);
  /** World point at (a along the front, d behind it). */
  const P = (a: number, d: number) => ({ x: spec.origin.x + av.x * a - n.x * d, z: spec.origin.z + av.z * a - n.z * d });
  const solid = (a0: number, a1: number, d0: number, d1: number, h: number) => {
    const p = [P(a0, d0), P(a1, d1)];
    colliders.push({ x0: Math.min(p[0].x, p[1].x), x1: Math.max(p[0].x, p[1].x), z0: Math.min(p[0].z, p[1].z), z1: Math.max(p[0].z, p[1].z), h });
  };
  /** A box spanning [a0,a1] × [d0,d1] (d: behind the front line, negative = over the street) × [y0,y1]. */
  const box = (a0: number, a1: number, d0: number, d1: number, y0: number, y1: number, mat: THREE.Material | THREE.Material[]) => {
    const m = mesh(new THREE.BoxGeometry(a1 - a0, y1 - y0, d1 - d0), Array.isArray(mat) ? mat[0] : mat), c = P((a0 + a1) / 2, (d0 + d1) / 2);
    if (Array.isArray(mat)) m.material = mat;
    m.position.set(c.x, (y0 + y1) / 2, c.z); m.rotation.y = yaw;
    return m;
  };
  const frame = std(ndiaye ? 0x2b2f36 : 0x15161a);
  const glass = new THREE.MeshBasicMaterial({ color: ndiaye ? 0xbfe3ee : 0xa9c4cf, transparent: true, opacity: ndiaye ? 0.16 : 0.22, depthWrite: false, side: THREE.DoubleSide });
  const lamp = glow(ndiaye ? 0xfff4d6 : 0xffe9b0), accent = glow(gold), accentLit = std(gold), body = std(navy), dark = std(0x15161a);

  // -- the glass: posts, panes between them, the entrance left open; the panes are solid (nobody walks or drives through the glass)
  const span = spec.a1 - spec.a0, count = Math.max(2, Math.round(span / 2.4));
  const posts = [...Array.from({ length: count + 1 }, (_, i) => spec.a0 + (i * span) / count), ...spec.gaps.flat()].sort((x, y) => x - y);
  const inGap = (a: number) => spec.gaps.some(g => a > g[0] + 0.01 && a < g[1] - 0.01);
  for (let i = 0; i < posts.length; i++) {
    if (inGap(posts[i]) || (i && posts[i - 1] > posts[i] - 0.05)) continue;
    box(posts[i] - 0.06, posts[i] + 0.06, -0.05, 0.1, 0, HEIGHT, frame);
  }
  for (let i = 0; i + 1 < posts.length; i++) {
    const a0 = posts[i], a1 = posts[i + 1];
    if (a1 - a0 < 0.2 || inGap((a0 + a1) / 2)) continue;
    box(a0, a1, 0, 0.03, 0.12, HEIGHT - 0.1, glass);
    box(a0, a1, -0.04, 0.08, 0, 0.12, frame);                  // the low plinth under the glass
    box(a0, a1, -0.05, 0.1, HEIGHT - 0.1, HEIGHT, frame);       // the rail along its top
    solid(a0, a1, -0.04, 0.1, HEIGHT);
  }
  // the entrance: a threshold strip and two accent-coloured jambs that mark it
  for (const g of spec.gaps) {
    box(g[0], g[1], -0.9, 0.9, 0, 0.025, accentLit);
    for (const e of g) { box(e - 0.07, e + 0.07, -0.05, 0.12, 0, HEIGHT, accentLit); solid(e - 0.07, e + 0.07, -0.05, 0.12, HEIGHT); }
  }

  // -- the lit fascia above the glass, the canopy over the pavement, light under it
  const ft = fasciaTex(brand); if (ft) textures.push(ft);
  const fw = new THREE.MeshBasicMaterial({ map: ft, color: ft ? 0xffffff : navy });
  box(spec.a0, spec.a1, -0.12, 0.1, HEIGHT, HEIGHT + (ndiaye ? 1.2 : 1.0), [body, body, body, body, body, fw]);
  box(spec.a0, spec.a1, -1.55, -0.05, HEIGHT, HEIGHT + 0.14, ndiaye ? body : dark);
  box(spec.a0, spec.a1, -1.55, -1.43, HEIGHT + 0.14, HEIGHT + 0.2, accentLit);
  for (let a = spec.a0 + 0.8; a < spec.a1 - 0.5; a += 2.0) box(a - 0.5, a + 0.5, -1.35, -1.2, HEIGHT - 0.02, HEIGHT, lamp);
  // inside: light strips under the roof, so the room shines through the glass
  for (let a = spec.a0 + 1.2; a < spec.a1 - 0.8; a += 2.6) box(a - 0.9, a + 0.9, 0.9, 1.0, HEIGHT - 0.04, HEIGHT - 0.02, lamp);

  if (!ndiaye) {
    // the platform, the roof, the back wall with a light line; the far end closed with glass, the desk end open
    box(spec.a0, spec.a1, 0, spec.depth, 0.1, 0.125, std(0xd8d2c4));
    box(spec.a0, spec.a1, -0.3, spec.depth, HEIGHT + 0.14, HEIGHT + 0.34, dark);
    box(spec.a0, spec.a1, spec.depth - 0.12, spec.depth - 0.02, 0.17, HEIGHT + 0.14, std(0x24262b));
    solid(spec.a0, spec.a1, spec.depth - 0.12, spec.depth - 0.02, HEIGHT);
    box(spec.a0, spec.a1, spec.depth - 0.16, spec.depth - 0.12, 2.9, 2.96, accent);
    box(spec.a0 + 0.3, spec.a1 - 0.3, spec.depth - 0.16, spec.depth - 0.12, 0.3, 0.34, accent);
    box(spec.a0, spec.a0 + 0.04, 0, spec.depth, 0.12, HEIGHT - 0.1, glass);
    solid(spec.a0, spec.a0 + 0.04, 0, spec.depth, HEIGHT);
    for (const d of spec.displays ?? []) {                      // a plinth under each car, ringed in gold
      const m = mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.012, 28), std(0xf3efe6)); m.position.set(d.x, 0.131, d.z);
      const r = mesh(new THREE.RingGeometry(1.25, 1.34, 28), accent); r.rotation.x = -Math.PI / 2; r.position.set(d.x, 0.14, d.z);
    }
  }
  // -- the price plaques: large, on the back wall behind each car, readable from the street
  const pq = plaqueTex(brand);
  if (pq && !ndiaye) {
    textures.push(pq);
    const mat = new THREE.MeshBasicMaterial({ map: pq }), face = Math.atan2(n.x, n.z);
    for (const d of spec.displays ?? []) {
      const a = (d.x - spec.origin.x) * av.x + (d.z - spec.origin.z) * av.z, m = mesh(new THREE.PlaneGeometry(1.5, 0.75), mat), c = P(a, spec.depth - 0.18);
      m.position.set(c.x, 2.0, c.z); m.rotation.y = face;
    }
  }

  // -- the tall sign: a blade at the corner (readable down the street, both ways), lit; on a pylon of its own at Prestige
  const bt = bladeTex(brand); if (bt) textures.push(bt);
  const bm = new THREE.MeshBasicMaterial({ map: bt, color: bt ? 0xffffff : navy });
  const bw = ndiaye ? 1.5 : 1.15, bh = ndiaye ? 3.75 : 4.6, by = ndiaye ? 3.4 : 3.3, bd = ndiaye ? -0.7 : 2.0, bx = spec.tower;
  box(bx - 0.06, bx + 0.06, bd - bw / 2, bd + bw / 2, by, by + bh, body);
  for (const s of [1, -1]) {                                   // one face each way along the street
    const f = mesh(new THREE.PlaneGeometry(bw, bh), bm), c = P(bx + s * 0.07, bd);
    f.position.set(c.x, by + bh / 2, c.z); f.rotation.y = Math.atan2(s * av.x, s * av.z);
  }
  if (!ndiaye) { box(bx - 0.14, bx + 0.14, bd - 0.14, bd + 0.14, 0.12, by, frame); solid(bx - 0.14, bx + 0.14, bd - 0.14, bd + 0.14, by); }
  else box(bx - 0.05, bx + 0.05, bd - 0.05, bd + 0.05, by + bh, by + bh + 0.5, frame);
}
