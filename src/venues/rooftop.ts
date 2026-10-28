import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld, Collider, Interactable } from '../world/types';
import type { Interior } from '../world/interiors';
import type { Seat } from '../interact/seats';
import type { Target } from '../interact/types';
import type { HubId } from '../core/types';
import { Batch, signTexture } from '../world/batch';
import { ENTER } from '../world/content';
import { rng } from '../core/rng';
import { signPanel } from '../economy/citeJamm';
import { order } from '../activity/primitives';

/**
 * Rooftop restaurants and lounges (Plateau, Corniche, Ngor): Plateau and Corniche use a stair door on a tall hub facade;
 * Almadies has its own independent commercial plot on the hospitality strip. Inside, all three reuse an open-air terrace —
 * pergola and string lights, tables and chairs (or low sofas), a bar where « Commander » opens the menu, and the city or sea
 * beyond the parapet. They are neither a gargote nor a maïga: a place to sit and be seen. Names and menus are invented;
 * juices and food only. Local frame: 16 × 11 m deck, stairs in the south parapet, bar along the north one.
 */
interface Dish { name: string; icon: string; price: number; faim: number; moral: number; social?: number; /** The plate or glass shown on the table (src/game/meals.ts). */ prop: string }
interface Def { id: string; name: string; sign: string; kind: 'restaurant' | 'lounge'; view: 'city' | 'sea'; ref: { x: number; z: number }; deck: number; accent: number; menu: Dish[]; blurb: string }
export const ROOFTOPS: Partial<Record<HubId, Def>> = {
  plateau: {
    id: 'plateau', name: 'Toit Baobab', sign: 'TOIT BAOBAB · RESTAURANT', kind: 'restaurant', view: 'city', ref: { x: 0, z: 0 }, deck: 0xd9c19a, accent: 0x2f7d4f,
    blurb: 'Restaurant sur le toit, au-dessus de la ville',
    menu: [
      { name: 'Thiéboudiène', icon: '🍚', price: 4500, faim: 60, moral: 5, prop: 'ceebu' }, { name: 'Yassa poulet', icon: '🍗', price: 4000, faim: 52, moral: 5, prop: 'yassa' },
      { name: 'Dibi grillé', icon: '🥩', price: 3500, faim: 44, moral: 4, prop: 'dibi' }, { name: 'Jus de bissap glacé', icon: '🍹', price: 800, faim: 6, moral: 4, social: 2, prop: 'bissap' },
    ],
  },
  corniche: {
    id: 'corniche', name: 'Sunset Lounge', sign: 'SUNSET LOUNGE · TERRASSE', kind: 'lounge', view: 'sea', ref: { x: 0, z: 0 }, deck: 0xcfb08a, accent: 0xd9762b,
    blurb: 'Lounge sur le toit, face à l’océan',
    menu: [
      { name: 'Mocktail bissap-menthe', icon: '🍹', price: 2500, faim: 5, moral: 9, social: 3, prop: 'bissap' }, { name: 'Jus de gingembre', icon: '🧃', price: 1000, faim: 6, moral: 4, prop: 'jus' },
      { name: 'Brochettes', icon: '🍢', price: 3000, faim: 36, moral: 4, prop: 'brochettes' }, { name: 'Poisson grillé', icon: '🐟', price: 5000, faim: 58, moral: 6, prop: 'poisson' },
    ],
  },
  almadies: {
    id: 'almadies', name: 'Terrasse de Ngor', sign: 'TERRASSE DE NGOR · RESTAURANT & LOUNGE', kind: 'lounge', view: 'sea', ref: { x: -30, z: -105.1 }, deck: 0xe0c9a4, accent: 0x1f7aa6,
    blurb: 'Terrasse ouverte et lounge, cuisine de la mer près de la plage',
    menu: [
      { name: 'Poisson braisé', icon: '🐟', price: 6000, faim: 62, moral: 7, prop: 'poisson' }, { name: 'Jus de bouye', icon: '🥤', price: 1200, faim: 8, moral: 5, prop: 'jus' },
      { name: 'Salade de mangue', icon: '🥗', price: 2800, faim: 28, moral: 4, prop: 'plate' }, { name: 'Café Touba', icon: '☕', price: 500, faim: 2, moral: 4, social: 2, prop: 'drink' },
    ],
  },
};

const ROOM_X = 3200, STEP = 60;
const HW = 8, HD = 5.5, PARAPET = 1.15;
interface Built { def: Def; door: Interactable; int: Interior; bar: { x: number; z: number }; facade: { x: number; z: number; nx: number; nz: number }; sign: { onRoof: boolean; top: number; faces: number; panels: NonNullable<HubWorld['rooftopSign']>['panels'] } | null }
let built: Built | null = null;
let ctxRef: GameCtx | null = null;

/** The stair door: the free spot in front of a tall building facade nearest to the hub's reference point. */
function findFacade(hub: HubWorld, ref: { x: number; z: number }): { x: number; z: number; nx: number; nz: number } | null {
  const near = (c: Collider, p: { x: number; z: number }, m: number) => p.x > c.x0 - m && p.x < c.x1 + m && p.z > c.z0 - m && p.z < c.z1 + m;
  const tall = hub.colliders.filter(c => c.h >= 5 && c.x1 - c.x0 >= 7 && c.z1 - c.z0 >= 7).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - ref.x, (a.z0 + a.z1) / 2 - ref.z) - Math.hypot((b.x0 + b.x1) / 2 - ref.x, (b.z0 + b.z1) / 2 - ref.z));
  for (const c of tall.slice(0, 40)) {
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const sides = [{ nx: 0, nz: 1, x: cx, z: c.z1 }, { nx: 0, nz: -1, x: cx, z: c.z0 }, { nx: 1, nz: 0, x: c.x1, z: cz }, { nx: -1, nz: 0, x: c.x0, z: cz }];
    for (const s of sides) {
      const p = { x: s.x + s.nx * 1.1, z: s.z + s.nz * 1.1 };
      if (hub.colliders.some(o => o !== c && near(o, p, 1.0))) continue;                         // nothing in front of the door
      if (hub.interactables.some(i => i.radius > 0 && Math.hypot(i.x - p.x, i.z - p.z) < i.radius + 1.5)) continue;   // not on top of another place's door
      if (Math.abs(hub.heightAt(p.x, p.z)) > 0.4) continue;
      return { x: p.x, z: p.z, nx: s.nx, nz: s.nz };
    }
  }
  return null;
}

/**
 * The rooftop restaurant's name on the roof (LD2.0-E round 4: « put it on top since it's a rooftop and make it visible from the street and far »): the hotel's gantry
 * (`hub.rooftopSign`) holds the faces, and this paints them in ONE atlas and builds them as ONE mesh, lit like every other sign at night: the long board (one face each way:
 * the street's, and the avenue's behind), a blade across each end of the roof, and the small plaque at the stair door that says where the way up is. One mesh: the door's old sign.
 */
type RoofFace = NonNullable<HubWorld['rooftopSign']>['panels'][number];
const ATLAS_W = 2048, INK = '#10283a', GOLD = '#ffe7a8', SEA = '#8fd3e8';
function paintBoard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lines: { t: string; k: number; col?: string }[]) {
  c.fillStyle = INK; c.fillRect(x, y, w, h);
  c.strokeStyle = GOLD; c.lineWidth = Math.max(4, Math.round(h / 32)); c.strokeRect(x + 6, y + 6, w - 12, h - 12);
  const gap = h * 0.035, total = lines.reduce((n, l) => n + l.k * h, 0) + gap * (lines.length - 1), pad = h * 0.3;
  let yy = y + (h - total) / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const l of lines) {
    let size = Math.round(l.k * h); c.font = `800 ${size}px system-ui, sans-serif`;
    while (c.measureText(l.t).width > w - 2 * pad && size > 8) { size -= 2; c.font = `800 ${size}px system-ui, sans-serif`; }
    c.fillStyle = l.col ?? GOLD; c.fillText(l.t, x + w / 2, yy + (l.k * h) / 2 + 2); yy += l.k * h + gap;
  }
}
function roofSignMesh(faces: RoofFace[], plaque: RoofFace): THREE.Mesh {
  const front = faces.find(f => f.kind === 'front'), blade = faces.find(f => f.kind === 'blade');
  const fh = Math.round(ATLAS_W * (front ? front.h / front.w : 0.2)), bh = Math.round(ATLAS_W / 2 * (blade ? blade.h / blade.w : 0.5)), ph = Math.round(ATLAS_W / 2 * (plaque.h / plaque.w)), H = fh + Math.max(bh, ph);
  const cv = document.createElement('canvas'); cv.width = ATLAS_W; cv.height = H;
  const c = cv.getContext('2d')!;
  paintBoard(c, 0, 0, ATLAS_W, fh, [{ t: 'TERRASSE DE NGOR', k: 0.5 }, { t: 'ROOFTOP · RESTAURANT & LOUNGE', k: 0.17, col: SEA }]);
  paintBoard(c, 0, fh, ATLAS_W / 2, bh, [{ t: 'TERRASSE', k: 0.28 }, { t: 'DE NGOR', k: 0.28 }, { t: 'ROOFTOP', k: 0.12, col: SEA }]);
  paintBoard(c, ATLAS_W / 2, fh, ATLAS_W / 2, ph, [{ t: 'TERRASSE · ACCÈS AU TOIT ↑', k: 0.4 }]);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const rect = (f: RoofFace, isPlaque: boolean) => isPlaque ? { x: ATLAS_W / 2, y: fh, w: ATLAS_W / 2, h: ph } : f.kind === 'front' ? { x: 0, y: 0, w: ATLAS_W, h: fh } : { x: 0, y: fh, w: ATLAS_W / 2, h: bh };
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const quad = (f: RoofFace, isPlaque = false) => {
    const rx = f.nz, rz = -f.nx, hw = f.w / 2, hh = f.h / 2, r = rect(f, isPlaque);
    const corner = (sx: number, sy: number) => [f.x + rx * hw * sx, f.y + hh * sy, f.z + rz * hw * sx];
    const bl = corner(-1, -1), br = corner(1, -1), tr = corner(1, 1), tl = corner(-1, 1);
    const u0 = r.x / ATLAS_W, u1 = (r.x + r.w) / ATLAS_W, v0 = 1 - (r.y + r.h) / H, v1 = 1 - r.y / H;
    pos.push(...bl, ...br, ...tr, ...bl, ...tr, ...tl); uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    for (let k = 0; k < 6; k++) nor.push(f.nx, 0, f.nz);
  };
  for (const f of faces) quad(f);
  quad(plaque, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }));
  m.name = 'rooftop-sign';
  return m;
}

/** The door in the facade: frame and a few bulbs, and the sign: the name up on the roof when the hub has the hotel's gantry (`hub.rooftopSign`), else over the door as before; the hub keeps the geometry. */
function dressFacade(hub: HubWorld, def: Def, f: { x: number; z: number; nx: number; nz: number }) {
  const b = new Batch(), yaw = Math.atan2(f.nx, f.nz), fx = f.x - f.nx * 1.1, fz = f.z - f.nz * 1.1;   // fx, fz: the facade face
  const ax = Math.abs(f.nx) > 0.5;                                                                        // facade along z when the normal is x
  const bx = (along: number, h: number, out: number, ca: number, y: number, co: number, col: number) => {
    const w = ax ? out : along, d = ax ? along : out;
    b.box(w, h, d, fx + (ax ? f.nx * co : ca), y, fz + (ax ? ca : f.nz * co), col);
  };
  bx(1.3, 2.4, 0.1, 0, 0.1, 0.07, 0x3a2a1c); bx(1.1, 2.2, 0.06, 0, 0.1, 0.12, def.accent);            // frame and door
  bx(0.1, 2.3, 0.12, -0.7, 0.1, 0.08, 0xe9dcc0); bx(0.1, 2.3, 0.12, 0.7, 0.1, 0.08, 0xe9dcc0);
  bx(1.6, 0.12, 0.45, 0, 2.5, 0.25, 0xe9dcc0);                                                          // canopy
  for (let i = -2; i <= 2; i++) bx(0.09, 0.09, 0.09, i * 0.34, 2.38, 0.46, 0xfff1c8);                   // bulbs
  const mesh = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }), true, false); if (mesh) hub.group.add(mesh);
  if (hub.rooftopSign) {                                                                                  // the name is on the roof; at the door, only the plaque that says the way up
    const plaque: RoofFace = { x: fx + f.nx * 0.14, y: 3.1, z: fz + f.nz * 0.14, w: 2.4, h: 0.6, nx: f.nx, nz: f.nz, kind: 'front' };
    const sign = roofSignMesh(hub.rooftopSign.panels, plaque); hub.group.add(sign); hub.signs.push(sign);
    return;
  }
  const panel = signPanel(signTexture(def.sign, '#1d2a3a', '#ffe7a8', 512, 128), 3.4, 0.72);
  panel.position.set(fx + f.nx * 0.14, 3.15, fz + f.nz * 0.14); panel.rotation.y = yaw; hub.group.add(panel); hub.signs.push(panel);
}

/** The terrace itself, open to the sky. */
function buildTerrace(def: Def, ox: number, oz: number, hub: string, doorX: number): { int: Interior; bar: { x: number; z: number } } {
  const group = new THREE.Group(), R = rng(def.id.length * 977 + (def.kind === 'lounge' ? 31 : 7));
  const x0 = ox - HW, x1 = ox + HW, z0 = oz - HD, z1 = oz + HD, G = 0.1;
  const floor = new Batch(), wood = new Batch(), plain = new Batch(), glow = new Batch(), far = new Batch();
  const colliders: Collider[] = [], seats: Seat[] = [];
  const solid = (x: number, z: number, w: number, d: number, h: number) => colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h });
  floor.box(HW * 2, 0.1, HD * 2, ox, 0, oz, def.deck);
  for (let i = -HW + 0.5; i < HW; i += 1) floor.box(0.03, 0.02, HD * 2, ox + i, 0.1, oz, 0x7a5f40);   // deck boards
  // parapet all round (a gap in the south one: the stairs)
  const par = (w: number, d: number, x: number, z: number) => { plain.box(w, PARAPET, d, x, G, z, 0xe9e1d1); plain.box(w + 0.06, 0.06, d + 0.06, x, G + PARAPET, z, def.accent); };
  const sx0 = doorX - 0.9, sx1 = doorX + 0.9;
  par(HW * 2 + 0.5, 0.25, ox, z0 - 0.12); par(0.25, HD * 2, x0 - 0.12, oz); par(0.25, HD * 2, x1 + 0.12, oz);
  par(sx0 - x0, 0.25, (x0 + sx0) / 2, z1 + 0.12); par(x1 - sx1, 0.25, (sx1 + x1) / 2, z1 + 0.12);
  plain.box(1.8, 0.1, 1.4, doorX, 0.0, z1 + 0.7, 0x4a4a52); plain.box(1.8, 1.3, 0.12, doorX, 0.1, z1 + 1.35, 0x2a2a30);   // the stairwell
  colliders.push({ x0: x0 - 1, z0: z0 - 1, x1: x1 + 1, z1: z0, h: PARAPET }, { x0: x0 - 1, z0, x1: x0, z1: z1 + 1, h: PARAPET }, { x0: x1, z0, x1: x1 + 1, z1: z1 + 1, h: PARAPET },
    { x0: x0 - 1, z0: z1, x1: sx0, z1: z1 + 1, h: PARAPET }, { x0: sx1, z0: z1, x1: x1 + 1, z1: z1 + 1, h: PARAPET });
  // pergola over the west half: posts, beams, slats and three strings of lights
  const PX = [x0 + 0.4, ox - 2.2], PZ = [z0 + 0.6, oz, z1 - 0.6];
  for (const px of PX) for (const pz of PZ) { wood.box(0.16, 2.9, 0.16, px, G, pz, 0x6b4a2e); solid(px, pz, 0.2, 0.2, 2.9); }
  for (const pz of PZ) wood.box(PX[1] - PX[0] + 0.4, 0.14, 0.16, (PX[0] + PX[1]) / 2, G + 2.9, pz, 0x6b4a2e);
  for (let px = PX[0]; px <= PX[1]; px += 0.5) wood.box(0.06, 0.06, PZ[2] - PZ[0] + 0.4, px, G + 3.04, (PZ[0] + PZ[2]) / 2, 0x7d5a3a);
  for (let k = 0; k < 3; k++) for (let n = 0; n <= 18; n++) glow.sphere(0.055, x0 + 0.5 + n * (HW * 2 - 1) / 18, G + 2.8 - Math.sin((n / 18) * Math.PI) * 0.18, z0 + 1.2 + k * 3.8, 0xfff0c0);
  // tables
  let n = 0;
  const chair = (x: number, z: number, rot: number, col: number, table?: Seat['table']) => {
    plain.box(0.46, 0.05, 0.46, x, G + 0.45, z, col); plain.box(0.46, 0.5, 0.05, x - Math.sin(rot) * 0.2, G + 0.5, z - Math.cos(rot) * 0.2, col);
    for (const [dx, dz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) plain.box(0.04, 0.45, 0.04, x + dx, G, z + dz, 0x2a2a30);
    seats.push({ id: `${hub}:rooftop:chair:${n++}`, x, z, top: 0.55, yaw: rot, kind: 'chair', space: '', occupant: null, table });
  };
  const table = (x: number, z: number, col: number) => {
    plain.cyl(0.5, 0.5, 0.05, x, G + 0.74, z, col, 14); plain.cyl(0.05, 0.05, 0.72, x, G, z, 0x2a2a30, 6); plain.cyl(0.25, 0.25, 0.03, x, G, z, 0x2a2a30, 10);
    glow.sphere(0.05, x, G + 0.84, z, 0xffe8a8); solid(x, z, 1.0, 1.0, 0.8);
  };
  // the east side stays clear from the bar to the stairs (x +4.1 … +5.9): the guest walks that aisle in and out, tables on either side of it
  const spots: [number, number][] = [[-5.2, 1.2], [-3.0, 2.8], [-5.2, 3.4], [-1.5, 0.6], [1.3, 1.0], [0.4, 3.4]];
  for (const [dx, dz] of spots) {
    const tx = ox + dx, tz = oz + dz;
    if (def.kind === 'restaurant') {
      table(tx, tz, 0xf2efe6); chair(tx - 0.85, tz, Math.PI / 2, 0x2a6a4a, { x: tx - 0.3, y: 0.86, z: tz }); chair(tx + 0.85, tz, -Math.PI / 2, 0x2a6a4a, { x: tx + 0.3, y: 0.86, z: tz });
    } else {                                                                                            // low table, a sofa and two poufs
      plain.box(1.1, 0.04, 0.7, tx, G + 0.38, tz, 0x4a3a2a); plain.box(0.9, 0.34, 0.5, tx, G, tz, 0x3a2f24); solid(tx, tz, 1.1, 0.7, 0.45);
      plain.box(2.0, 0.42, 0.7, tx, G, tz + 0.95, def.accent); plain.box(2.0, 0.4, 0.14, tx, G + 0.42, tz + 1.25, def.accent); solid(tx, tz + 1.0, 2.0, 0.8, 0.8);
      for (let i = 0; i < 3; i++) seats.push({ id: `${hub}:rooftop:sofa:${n++}`, x: tx + (i - 1) * 0.62, z: tz + 0.92, top: 0.46, yaw: Math.PI, kind: 'bench', space: '', occupant: null, table: { x: tx, y: 0.5, z: tz } });
      for (const sx of [-0.85, 0.85]) { plain.cyl(0.25, 0.25, 0.36, tx + sx, G, tz - 0.8, 0xe9dcc0, 10); seats.push({ id: `${hub}:rooftop:pouf:${n++}`, x: tx + sx, z: tz - 0.8, top: 0.4, yaw: 0, kind: 'chair', space: '', occupant: null, table: { x: tx + sx * 0.4, y: 0.5, z: tz } }); }
    }
  }
  // the bar along the north parapet, with stools and a shelf of bottles and jugs
  const bz = z0 + 1.1, bx = ox + 2.2;
  plain.box(5.0, 1.0, 0.7, bx, G, bz, 0x5a3a22); plain.box(5.2, 0.06, 0.8, bx, G + 1.0, bz, def.accent); solid(bx, bz, 5.0, 0.7, 1.1);
  plain.box(5.0, 0.05, 0.3, bx, G + 1.6, z0 + 0.3, 0x6b4a2e);
  for (let i = 0; i < 12; i++) plain.cyl(0.05, 0.05, 0.3, bx - 2.2 + i * 0.4, G + 1.65, z0 + 0.3, [0xe8742c, 0x2fa05a, 0xd9482b, 0xf2c430][i % 4], 6);
  for (let i = 0; i < 4; i++) { const sx = bx - 1.6 + i * 1.1; plain.cyl(0.2, 0.2, 0.06, sx, G + 0.68, bz + 0.85, 0x2a2a30, 10); plain.cyl(0.04, 0.04, 0.66, sx, G, bz + 0.85, 0x2a2a30, 6); seats.push({ id: `${hub}:rooftop:stool:${n++}`, x: sx, z: bz + 0.85, top: 0.72, yaw: Math.PI, kind: 'chair', space: '', occupant: null }); }
  // pots and plants along the parapet
  for (let i = 0; i < 6; i++) { const px = x0 + 1.2 + i * 2.7, pz = z1 - 0.4; plain.cyl(0.26, 0.2, 0.4, px, G, pz, 0xb5532f, 8); plain.sphere(0.34, px, G + 0.7, pz, 0x3f9a4f); solid(px, pz, 0.5, 0.5, 0.9); }
  // beyond the parapet: the city, or the sea with a far island and a long wave line
  if (def.view === 'city') {
    for (let i = 0; i < 46; i++) {
      const a = R() * Math.PI * 2, r = 16 + R() * 34, w = 4 + R() * 7, d = 4 + R() * 7, h = 8 + R() * 30;
      const x = ox + Math.cos(a) * r, z = oz + Math.sin(a) * r;
      far.box(w, h, d, x, -9, z, [0xd9cdb5, 0xc4ccd6, 0xe6d6c2, 0xb8c0ca, 0xe3dccd][Math.floor(R() * 5)]);
      for (let k = 0; k < 4; k++) glow.box(0.9, 0.7, 0.05, x + (R() - 0.5) * w * 0.7, -9 + 2 + R() * (h - 4), z + (d / 2 + 0.03) * (R() < 0.5 ? 1 : -1), 0xffe9b0);
    }
  } else {
    far.box(300, 0.4, 140, ox, -9.4, oz - 95, 0x2f86b6); far.box(300, 0.2, 120, ox, -9.2, oz - 100, 0x3fa0c9);
    far.box(40, 6, 12, ox - 40, -9.4, oz - 70, 0x5d7a52); far.box(20, 3, 8, ox - 44, -9.4, oz - 66, 0x7a9a63);     // the island
    for (let i = 0; i < 8; i++) far.box(60, 0.05, 0.3, ox - 60 + R() * 120, -9.1, oz - 40 - i * 9, 0xe9f4fb);
    for (let i = 0; i < 18; i++) { const a = Math.PI * (0.05 + R() * 0.9), r = 22 + R() * 30; far.box(5 + R() * 5, 8 + R() * 14, 5 + R() * 5, ox + Math.cos(a) * r * 1.4, -9, oz + 24 + Math.sin(a) * r, 0xd9cdb5); }
  }
  const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const [b, m, cast] of [[floor, lam(), false], [wood, lam(), true], [plain, lam(), true], [glow, new THREE.MeshBasicMaterial({ vertexColors: true }), false], [far, lam(), false]] as [Batch, THREE.Material, boolean][]) {
    const mesh = b.build(m, true, cast); if (mesh) group.add(mesh);
  }
  const int: Interior = {
    kind: 'venue', name: def.name, group, colliders, seats, interactables: [{ id: `${hub}:rooftop:out`, name: 'Sortir', kind: 'actions', x: doorX, z: z1 - 0.5, radius: 1.3, actions: [{ id: 'sortir', label: 'Descendre', seconds: 0, special: 'exit' }] }],
    bounds: { x0: x0 + 0.3, x1: x1 - 0.3, z0: z0 + 0.3, z1: z1 - 0.2 }, cameraBox: { x0: x0 + 0.15, x1: x1 - 0.15, z0: z0 + 0.15, z1: z1 - 0.15 },
    spawn: { x: doorX - 0.4, z: z1 - 1.5, yaw: Math.PI + 0.3 }, light: new THREE.Vector3(ox, 4.2, oz + 0.5), lightColor: 0xffe2b0, open: true,
  };
  return { int, bar: { x: bx, z: bz + 1.3 } };
}
const money = (n: number) => `${n.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;

/** What the bar serves, as the ordinary `order` activity: pay once at the start, the dish is prepared, the guest sits at the nearest table, eats or drinks, and the needs come at the last bite. */
export function dishActivity(def: Def, d: Dish, at: { x: number; z: number }) {
  const drink = d.faim < 10;
  const a = order({
    id: `${def.id}:rooftop:${d.name}`, label: `${def.name} : ${d.name}`, icon: d.icon, price: d.price, prep: 3, eat: drink ? 4 : 7, drink, prop: d.prop,
    needs: { faim: d.faim, moral: d.moral, ...(d.social ? { social: d.social } : {}) },
    seat: { near: at, r: 16, rank: s => (s.table ? 0 : 100) + Math.hypot(s.x - at.x, s.z - at.z) },     // a table seat first (the plate is set on the table), the stools last
  });
  const last = a.steps[a.steps.length - 1];
  last.effects = { ...last.effects, counters: { ...last.effects?.counters, terrasse: 1 } };
  return a;
}

function openMenu(ctx: GameCtx, def: Def, at: { x: number; z: number }) {
  const s = ctx.state;
  ctx.menu(def.name, `${def.blurb} · ton argent : ${money(s.wallet)}`, def.menu.map(d => ({
    icon: d.icon, label: d.name, right: '−' + money(d.price), detail: s.wallet < d.price ? 'Pas assez d’argent' : undefined, disabled: s.wallet < d.price,
    onPick: () => {
      if (s.wallet < d.price) return;
      ctx.hud.closeModal();
      ctx.activities.start(dishActivity(def, d, at), { place: def.name });
    },
  })));
}

/** The terrace the player is on, for the modules that stand people in it (M4). */
export const rooftopHere = () => built ? { def: built.def, doorId: built.door.id, bar: built.bar, ox: ROOM_X + Object.keys(ROOFTOPS).indexOf(built.def.id) * STEP, group: built.int.group } : null;

export const RooftopModule: GameModule = {
  name: 'rooftop',
  init(ctx) {
    ctxRef = ctx;
    ctx.interactions.add({ name: 'rooftop', collect: (space, _x, _z, out: Target[]) => {
      const b = built; if (!b || space !== b.door.id) return;
      out.push({ id: `${b.door.id}:bar`, name: 'Le bar', kind: 'counter', space, x: b.bar.x, z: b.bar.z, radius: 2.2, bias: 0.1,
        affordances: () => [{ id: 'commander', verb: 'browse', label: 'Commander', icon: b.def.menu[0].icon, detail: b.def.blurb, run: () => openMenu(ctx, b.def, b.bar) }] });
    } });
  },
  hubLoaded(ctx, hub) {
    built = null;
    const def = ROOFTOPS[hub.id as HubId]; if (!def) return;
    const f = hub.rooftopDoor ?? findFacade(hub, def.ref); if (!f) return;      // the Almadies' district names its door (the hotel's street face); elsewhere the nearest tall building's first free side
    dressFacade(hub, def, f);
    const idx = Object.keys(ROOFTOPS).indexOf(def.id), ox = ROOM_X + idx * STEP, doorX = ox + 5;
    const door: Interactable = { id: `${hub.id}:rooftop:${def.id}`, name: def.name, kind: 'actions', x: f.x, z: f.z, radius: 3.4, actions: [ENTER], description: def.blurb };
    hub.interactables.push(door);
    hub.interactables.push({ id: `${hub.id}:rooftop:dir`, name: `${def.name} · toit`, kind: 'actions', x: f.x, z: f.z, radius: -1, actions: [], description: def.blurb });
    const t = buildTerrace(def, ox, 0, hub.id, doorX);
    ctx.addInterior(door, t.int);
    const rs = hub.rooftopSign;
    built = { def, door, int: t.int, bar: t.bar, facade: f, sign: rs ? { onRoof: true, top: Math.max(...rs.panels.map(p => p.y + p.h / 2)), faces: rs.panels.length, panels: rs.panels } : null };
  },
  debug: () => ({
    rooftop: {
      info: () => built ? { hub: built.def.id, name: built.def.name, kind: built.def.kind, door: { id: built.door.id, x: built.door.x, z: built.door.z }, facade: built.facade, sign: built.sign, bar: built.bar, seats: built.int.seats.length, menu: built.def.menu.map(d => [d.name, d.price]) } : null,
      enter: () => { if (built && ctxRef) ctxRef.enter(built.door.id); },
      order: (i = 0) => { if (!built || !ctxRef) return false; const d = built.def.menu[i], s = ctxRef.state; if (s.wallet < d.price) return false; s.addMoney(-d.price, `${built.def.name} : ${d.name}`); s.adjust({ faim: d.faim, moral: d.moral }); return true; },
    },
  }),
};
