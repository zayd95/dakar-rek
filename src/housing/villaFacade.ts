import * as THREE from 'three';
import { Batch } from '../world/batch';
import { addGrain } from '../world/grain';
import { HELIPAD, STOREY } from './villa';
import { VILLA_PLAN } from './villaPlan';
import { FINISH_SIZE, stoneTiles } from './villaFinish';
import { levelOfRoom, wallPieces, type FloorPlan, type Level, type Rect, type Room, type Window } from './plan';

/**
 * LD2.0-D (docs/ld2/LD2_D.md): the villa as seen from the street, drawn from the same plan as its interior (src/housing/villaPlan.ts). Lane V-E
 * places it on the lot (src/world/villaCompound.ts).
 *
 * The look pass (the owner's « aspirational Almadies residence, a modern premium Senegalese villa »):
 * - the ground floor's storey clad in travertine (the plan's `clad` rooms), the floor above and the stair tower in an ivory render;
 * - thin white slabs cantilevered past the walls: between the storeys (0.45 m, the street balcony deeper) and the roof (1 m toward the street, 0.6 m
 *   elsewhere), each with a 25 cm edge; the stair head's own thin roof;
 * - floor-to-ceiling glazing in slim dark frames where the plan has it (the salons, the suite, the landing), the panes set back in their reveals, a
 *   frameless glass guard before a tall window upstairs with no balcony;
 * - frameless glass balustrades on the balconies and round the roof terrace; the pergola over the terrace's street corner;
 * - the stair tower's street face behind a wooden claustra (a moucharabieh of oak slats in a rippling rhythm) in a white frame, from the ground to
 *   above the roof;
 * - a tall teak front door in a dark bronze portal, travertine steps;
 * - at night (`setVillaFacadeNight`, called by main.ts with the street's lighting): warm light in every window, uplights washing the stone and the
 *   claustra, downlights under the roof's overhang, a line of light along the roof's edge, the helipad's edge lights.
 *
 * Local frame: the lot's plan coordinates (house x −8…8, z −5…4, +z toward the street), y 0 the ground. Six meshes at most: the render, the
 * travertine, the trims (frames, slab soffits' lights' bodies, wood, the helipad), the glazing (lit at night), the glass of the balustrades, the
 * lights (additive, dark by day).
 */
const RENDER = 0xf8f4ec, SLAB = 0xfaf7f1, CLAD = 0xe4d2b2, TOWER = 0x6e665d, ALU = 0x2b2d2f, BRONZE = 0x4a3d31, STEEL = 0xc5c8ca, OAK = 0xb98a5a,
  OAK2 = 0x9c6f45, PLINTH = 0x4a4642, DOOR = 0x8a5a36, DECK = 0xb08458, WARM = new THREE.Color(1.0, 0.68, 0.36), BLACK = new THREE.Color(0, 0, 0);
let mats: { render: THREE.MeshLambertMaterial; stone: THREE.Material; trim: THREE.Material; glaze: THREE.MeshLambertMaterial; glass: THREE.Material; light: THREE.MeshBasicMaterial } | null = null;
function materials() {
  if (mats) return mats;
  const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  mats = {
    render: addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xfff8ee, emissiveIntensity: 0.1 }), 0.04, 1) as THREE.MeshLambertMaterial,
    stone: addGrain(lam(), 0.05, 1, false, stoneTiles(), FINISH_SIZE),
    trim: addGrain(lam(), 0.2, 2),
    glaze: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffbf7a, emissiveIntensity: 0 }),
    glass: new THREE.MeshLambertMaterial({ color: 0xcfeaf2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
    light: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x000000 }),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}
/** The façade's materials (shared, never disposed): the villa's other pieces in the same finishes (the main entrance's travertine and teak, src/world/villaCompound.ts). */
export const villaFacadeMaterials = () => materials();
/** The night (0 by day … 1 at night, main.ts updateLighting): the windows' warm light, the uplights, the roof's edge, the helipad's lights. */
export function setVillaFacadeNight(night: number) {
  const M = materials();
  M.glaze.emissiveIntensity = 0.18 * night;
  M.light.color.setScalar(night);
  M.render.emissiveIntensity = 0.1 * (1 - night);
}

/** `plan`: the villa's (its rooms, windows, openings, balconies, pergola and helipad). */
export function buildVillaFacade(plan: FloorPlan = VILLA_PLAN): THREE.Group {
  const g = new THREE.Group(); g.name = 'villa-facade';
  const M = materials(), wall = new Batch(), stone = new Batch(), trim = new Batch(), glaze = new Batch(), glass = new Batch(), light = new Batch();
  const LV = plan.levels!, top = LV.length - 1, H = plan.wallH, t = plan.outWall / 2;
  const room = (id: string) => plan.rooms.find(r => r.id === id)!;
  const li = (l: Level) => LV.indexOf(l);
  /** A box over a rect of the house (house metres), from y0 to y1 (all six faces when `under`: a soffit seen from below). */
  const box = (b: Batch, r: Rect, y0: number, y1: number, c: number, under = false) => {
    if (r.x1 - r.x0 < 1e-4 || r.z1 - r.z0 < 1e-4 || y1 - y0 < 1e-4) return;
    if (under) b.slab(r.x1 - r.x0, y1 - y0, r.z1 - r.z0, (r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2, c);
    else b.box(r.x1 - r.x0, y1 - y0, r.z1 - r.z0, (r.x0 + r.x1) / 2, y0, (r.z0 + r.z1) / 2, c);
  };
  /** A rect from a span along a wall line (a..b) and an offset across it (c0..c1). */
  const lineRect = (axis: 'x' | 'z', at: number, a: number, b: number, c0: number, c1: number): Rect => axis === 'x'
    ? { x0: Math.min(a, b), x1: Math.max(a, b), z0: at + Math.min(c0, c1), z1: at + Math.max(c0, c1) }
    : { x0: at + Math.min(c0, c1), x1: at + Math.max(c0, c1), z0: Math.min(a, b), z1: Math.max(a, b) };
  /**
   * A flat quad on a wall line, facing `out` (+1: toward +z or +x), its corners' colours (bottom, top) and widths (bottom, top: a light's cone), for
   * the glazing's panes and the lights' washes.
   */
  const quad = (b: Batch, axis: 'x' | 'z', at: number, a0: number, a1: number, y0: number, y1: number, out: 1 | -1, cb: THREE.Color, ct: THREE.Color, wb = 1, wt = 1) => {
    const m = (a0 + a1) / 2, hb = ((a1 - a0) / 2) * wb, ht = ((a1 - a0) / 2) * wt;
    const P = (u: number, y: number) => axis === 'x' ? [u, y, at] : [at, y, u];
    const pts = [P(m - hb, y0), P(m + hb, y0), P(m + ht, y1), P(m - ht, y1)], cols = [cb, cb, ct, ct];
    // wound to face `out`: along x, +z is seen with the u axis left to right; along z, +x with it right to left
    const order = (axis === 'x') === (out > 0) ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    const pos: number[] = [], col: number[] = [];
    for (const i of order) { pos.push(...pts[i]); col.push(cols[i].r, cols[i].g, cols[i].b); }
    const q = new THREE.BufferGeometry();
    q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    b.coloured(q);
  };
  const SKY_HI = new THREE.Color(0x9ebfd2), SKY_LO = new THREE.Color(0x2b3a45);

  // ---------------------------------------------------------------- the house's outline, per level (house metres), and which way is out
  const indoor = plan.rooms.filter(r => !r.outdoor);
  const roomAt = (l: Level, x: number, z: number, out = false): Room | null => plan.rooms.find(r => levelOfRoom(plan, r) === l && !!r.outdoor === out && x > r.box.x0 - l.dx && x < r.box.x1 - l.dx && z > r.box.z0 && z < r.box.z1) ?? null;
  const house = (l: Level) => {
    const rs = indoor.filter(r => levelOfRoom(plan, r) === l);
    return { x0: Math.min(...rs.map(r => r.box.x0)) - l.dx, x1: Math.max(...rs.map(r => r.box.x1)) - l.dx, z0: Math.min(...rs.map(r => r.box.z0)), z1: Math.max(...rs.map(r => r.box.z1)) };
  };
  const H0 = house(LV[0]);
  /** The stair tower (the street face behind the claustra): the ground floor's rooms east of the salle à manger, over the whole depth. */
  const towerX0 = room('hall').box.x0, towerX1 = H0.x1;
  /** Heights: the walls of each storey run up to the slab above (its soffit); the slabs' 25 cm edges; the stair head's walls and roof. */
  const P1 = { y0: H + 0.15, y1: STOREY }, P2 = { y0: STOREY + H + 0.15, y1: 2 * STOREY }, HEAD = { y0: 2 * STOREY + H + 0.15, y1: 2 * STOREY + H + 0.4 };
  const wallTop = (k: number) => k === 0 ? P1.y0 : k === 1 ? P2.y0 : HEAD.y0;

  // ---------------------------------------------------------------- the outside walls, storey by storey, less their windows and glazed openings
  const windowsOn = (axis: 'x' | 'z', at: number) => plan.windows.flatMap((w: Window) => {
    const b = room(w.room).box, line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side], wa = w.side === 'n' || w.side === 's' ? 'x' : 'z';
    return wa === axis && Math.abs(line - at) < 1e-6 ? [w] : [];
  });
  const glazing: { axis: 'x' | 'z'; at: number; lo: number; hi: number; y0: number; y1: number; out: 1 | -1; tall: boolean; guard: boolean }[] = [];
  const uplightSpots: { axis: 'x' | 'z'; at: number; u: number; out: 1 | -1 }[] = [];
  for (const pc of wallPieces(plan)) {
    if (pc.kind !== 'wall' || !pc.outer) continue;
    const l = LV.find(q => q.id === pc.level)!, k = li(l), dx = l.dx, y = l.y, a = pc.axis === 'x' ? pc.x0 : pc.z0, b = pc.axis === 'x' ? pc.x1 : pc.z1;
    const at = pc.at - (pc.axis === 'z' ? dx : 0), A = a - (pc.axis === 'x' ? dx : 0), B = b - (pc.axis === 'x' ? dx : 0), mid = (A + B) / 2;
    // the room inside the wall (which way is out), and what the wall's face is: travertine, the render, or the tower's dark face behind the claustra
    const probe = (s: number) => pc.axis === 'x' ? roomAt(l, mid, at + s * (t + 0.05)) : roomAt(l, at + s * (t + 0.05), mid);
    const inside = probe(1) ?? probe(-1), out: 1 | -1 = probe(1) ? -1 : 1;
    const behindClaustra = pc.axis === 'x' && out > 0 && Math.abs(at - H0.z1) < 1e-6 && A >= towerX0 - 0.2;
    const clad = inside?.clad === 'stone';
    const face = (u0: number, u1: number, y0: number, y1: number) => {
      if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return;
      box(clad ? stone : wall, lineRect(pc.axis, at, u0, u1, -t, t), y0, y1, behindClaustra ? TOWER : clad ? CLAD : RENDER);
    };
    const y0 = y + (k === 0 && !clad ? 0.12 : 0), yTop = wallTop(k);
    if (k === 0 && !clad) box(trim, lineRect(pc.axis, at, A, B, -t + 0.02, t - 0.02), 0, 0.12, PLINTH);
    let u = A;
    const wins = windowsOn(pc.axis, pc.at).map(w => ({ w, lo: w.at - (pc.axis === 'x' ? dx : 0) - w.width / 2, hi: w.at - (pc.axis === 'x' ? dx : 0) + w.width / 2 }))
      .filter(q => q.lo >= A - 1e-6 && q.hi <= B + 1e-6).sort((p2, q) => p2.lo - q.lo);
    for (const { w, lo, hi } of wins) {
      face(u, lo, y0, yTop); face(lo, hi, y0, y + w.sill); face(lo, hi, y + w.sill + w.height, yTop);
      const tall = w.sill < 0.2;
      // a guard before a tall window upstairs, where no balcony stands before it
      const before = pc.axis === 'x' ? roomAt(l, (lo + hi) / 2, at + out * (t + 0.3), true) : roomAt(l, at + out * (t + 0.3), (lo + hi) / 2, true);
      glazing.push({ axis: pc.axis, at, lo, hi, y0: y + w.sill, y1: y + w.sill + w.height, out, tall, guard: k > 0 && w.sill < 0.9 && !before });
      u = hi;
    }
    face(u, B, y0, yTop);
    if (k === 0) for (let s2 = A + 0.6; s2 < B - 0.5; s2 += 1.9) uplightSpots.push({ axis: pc.axis, at: at + out * t, u: s2, out });
  }
  // the openings in the outside walls: the wall over them, what fills them (the glazing of a glazed opening, the front door)
  let door: { axis: 'x' | 'z'; at: number; lo: number; hi: number; h: number; out: 1 | -1 } | null = null;
  for (const o of plan.openings) {
    const ra = room(o.a), rb = o.b === 'out' ? null : room(o.b), outer = !rb || !!ra.outdoor || !!rb.outdoor; if (!outer) continue;
    const l = levelOfRoom(plan, ra), k = li(l), dx = l.dx, y = l.y, at = o.axis === 'x' ? o.z : o.x - dx, c = o.axis === 'x' ? o.x - dx : o.z, lo = c - o.width / 2, hi = c + o.width / 2;
    const ins = ra.outdoor ? rb! : ra, clad = ins.clad === 'stone';
    const probe = o.axis === 'x' ? roomAt(l, c, at + (t + 0.05)) : roomAt(l, at + (t + 0.05), c), out: 1 | -1 = probe === ins ? -1 : 1;
    box(clad ? stone : wall, lineRect(o.axis, at, lo, hi, -t, t), y + o.height, wallTop(k), clad ? CLAD : RENDER);
    if (o.kind === 'front') { door = { axis: o.axis, at, lo, hi, h: o.height, out }; continue; }
    if (o.kind === 'glass') glazing.push({ axis: o.axis, at, lo, hi, y0: y, y1: y + o.height, out, tall: true, guard: false });
  }
  // ---------------------------------------------------------------- the glazing: panes set back in their reveals, slim dark frames, mullions
  for (const q of glazing) {
    const inset = q.out * (t - 0.09), fr = (a: number, b: number, y0: number, y1: number) => box(trim, lineRect(q.axis, q.at, a, b, inset - 0.03, inset + 0.03), y0, y1, ALU);
    quad(glaze, q.axis, q.at + inset, q.lo, q.hi, q.y0, q.y1, q.out, SKY_LO, SKY_HI);
    // at night the room behind is lit, unevenly from one window to the next, brighter toward its ceiling
    const lit = 0.04 + 0.11 * ((Math.abs(Math.round(q.lo * 7.3 + q.y0 * 3.1)) % 5) / 4);
    quad(light, q.axis, q.at + inset + q.out * 0.004, q.lo + 0.05, q.hi - 0.05, q.y0 + 0.05, q.y1 - 0.05, q.out, WARM.clone().multiplyScalar(lit * 0.6), WARM.clone().multiplyScalar(lit));
    fr(q.lo, q.lo + 0.05, q.y0, q.y1); fr(q.hi - 0.05, q.hi, q.y0, q.y1); fr(q.lo, q.hi, q.y1 - 0.05, q.y1); fr(q.lo, q.hi, q.y0, q.y0 + 0.05);
    const n = Math.max(1, Math.round((q.hi - q.lo) / 1.4));
    for (let k = 1; k < n; k++) { const m = q.lo + (k / n) * (q.hi - q.lo); fr(m - 0.02, m + 0.02, q.y0, q.y1); }
    if (!q.tall) box(trim, lineRect(q.axis, q.at, q.lo - 0.03, q.hi + 0.03, q.out * (t - 0.05), q.out * (t + 0.04)), q.y0 - 0.04, q.y0, 0xd9cdb8);
    if (q.guard) {
      box(glass, lineRect(q.axis, q.at, q.lo + 0.02, q.hi - 0.02, q.out * (t + 0.05), q.out * (t + 0.07)), q.y0, q.y0 + 1.05, 0xffffff);
      box(trim, lineRect(q.axis, q.at, q.lo, q.hi, q.out * (t + 0.04), q.out * (t + 0.08)), q.y0 + 1.05, q.y0 + 1.08, STEEL);
    }
  }
  // ---------------------------------------------------------------- the front door: tall teak in a dark bronze portal, travertine steps, wall lights
  if (door) {
    const { axis, at, lo, hi, h, out } = door, d0 = out * (t - 0.06);
    box(trim, lineRect(axis, at, lo, hi, d0 - 0.03, d0 + 0.03), 0, h, DOOR);
    for (let k = 1; k < 8; k++) { const e = lo + (k / 8) * (hi - lo); box(trim, lineRect(axis, at, e - 0.007, e + 0.007, d0 + out * 0.03, d0 + out * 0.034), 0.1, h - 0.1, 0x5c3c24); }
    box(trim, lineRect(axis, at, hi - 0.22, hi - 0.18, d0 + out * 0.03, d0 + out * 0.09), 0.55, 1.95, 0xb0915e);
    const p0 = out * t, p1 = out * (t + 0.22);
    box(trim, lineRect(axis, at, lo - 0.16, lo, p0, p1), 0, h + 0.16, BRONZE); box(trim, lineRect(axis, at, hi, hi + 0.16, p0, p1), 0, h + 0.16, BRONZE);
    box(trim, lineRect(axis, at, lo - 0.16, hi + 0.16, p0, p1), h, h + 0.16, BRONZE);
    box(stone, lineRect(axis, at, lo - 0.9, hi + 0.9, out * t, out * (t + 1.4)), 0, 0.16, 0xece2d0);
    box(stone, lineRect(axis, at, lo - 1.2, hi + 1.2, out * (t + 1.4), out * (t + 2.0)), 0, 0.08, 0xece2d0);
    for (const e of [lo - 0.55, hi + 0.45]) {
      box(trim, lineRect(axis, at, e, e + 0.1, out * t, out * (t + 0.09)), 1.55, 2.15, BRONZE);
      box(light, lineRect(axis, at, e + 0.02, e + 0.08, out * (t + 0.09), out * (t + 0.1)), 1.6, 2.1, 0xffffff);
      quad(light, axis, at + out * (t + 0.01), e - 0.25, e + 0.35, 2.15, 3.1, out, WARM.clone().multiplyScalar(0.35), BLACK, 0.3, 1.2);
      quad(light, axis, at + out * (t + 0.01), e - 0.25, e + 0.35, 0.3, 1.55, out, BLACK, WARM.clone().multiplyScalar(0.35), 1.2, 0.3);
    }
  }
  // ---------------------------------------------------------------- the slabs: thin white edges cantilevered past the walls; their soffit lights
  const grow = (r: Rect, n: number, s: number, e: number, w: number): Rect => ({ x0: r.x0 - t - w, x1: r.x1 + t + e, z0: r.z0 - t - n, z1: r.z1 + t + s });
  const balcony = (id: string) => { const r = room(id), l = levelOfRoom(plan, r); return { x0: r.box.x0 - l.dx, x1: r.box.x1 - l.dx, z0: r.box.z0, z1: r.box.z1 }; };
  const plates: [Rect, { y0: number; y1: number }][] = [];
  // between the storeys: 45 cm all round, the street side but for the tower; the two balconies
  plates.push([grow(H0, 0.45, 0, 0.45, 0.45), P1], [{ x0: H0.x0 - t - 0.45, x1: towerX0, z0: H0.z1 + t, z1: H0.z1 + t + 0.45 }, P1]);
  for (const id of ['balcon_rue', 'balcon_piscine']) { const b = balcony(id); plates.push([{ x0: b.x0, x1: b.x1, z0: Math.min(b.z0, H0.z1 + t), z1: Math.max(b.z1, H0.z0 - t) }, P1]); }
  // the roof: 60 cm all round, a metre toward the street (but over the tower, where the claustra rises past it)
  const H1 = house(LV[1]);
  plates.push([grow(H1, 0.6, 0, 0.6, 0.6), P2], [{ x0: H1.x0 - t - 0.6, x1: towerX0, z0: H1.z1 + t, z1: H1.z1 + t + 1.0 }, P2]);
  // the stair head's roof
  const head = house(LV[top]);
  plates.push([grow(head, 0.4, 0.4, 0.4, 0.4), HEAD]);
  for (const [r, y] of plates) box(wall, r, y.y0, y.y1, SLAB, true);
  // decks on the balconies and the roof terrace (seen from above), a line of light under the roof's edge, downlights in the soffits
  for (const r of plan.rooms) if (r.outdoor && levelOfRoom(plan, r).y > 0) { const l = levelOfRoom(plan, r); box(trim, { x0: r.box.x0 - l.dx, x1: r.box.x1 - l.dx, z0: r.box.z0, z1: r.box.z1 }, l.y, l.y + 0.012, DECK); }
  /** A line of light under a slab's edge (6 cm in from its fascia, 4 cm wide), all round a rect. */
  const edgeLine = (r: Rect, y: number) => {
    const i = 0.06, w = 0.04;
    for (const q of [{ x0: r.x0 + i, x1: r.x1 - i, z0: r.z0 + i, z1: r.z0 + i + w }, { x0: r.x0 + i, x1: r.x1 - i, z0: r.z1 - i - w, z1: r.z1 - i },
      { x0: r.x0 + i, x1: r.x0 + i + w, z0: r.z0 + i, z1: r.z1 - i }, { x0: r.x1 - i - w, x1: r.x1 - i, z0: r.z0 + i, z1: r.z1 - i }]) box(light, q, y - 0.012, y - 0.004, 0xffe2b8, true);
  };
  edgeLine(grow(H1, 0.6, 0, 0.6, 0.6), P2.y0);
  {
    // and a line along the roof's fascia, seen from anywhere at night
    // (toward the street the slab reaches a metre out but for the tower, where it stops at the wall behind the claustra)
    const r = grow(H1, 0.6, 1.0, 0.6, 0.6), y = P2.y0 + 0.015, c = 0xffd9a8;
    box(light, { x0: r.x0, x1: towerX0, z0: r.z1, z1: r.z1 + 0.006 }, y, y + 0.025, c); box(light, { x0: r.x0, x1: r.x1, z0: r.z0 - 0.006, z1: r.z0 }, y, y + 0.025, c);
    box(light, { x0: r.x0 - 0.006, x1: r.x0, z0: r.z0, z1: r.z1 }, y, y + 0.025, c); box(light, { x0: r.x1, x1: r.x1 + 0.006, z0: r.z0, z1: H1.z1 + t }, y, y + 0.025, c);
    box(light, { x0: towerX0 - 0.006, x1: towerX0, z0: H1.z1 + t, z1: r.z1 }, y, y + 0.025, c);
  }
  edgeLine({ x0: H1.x0 - t - 0.6, x1: towerX0, z0: H1.z1 + t + 0.3, z1: H1.z1 + t + 1.0 }, P2.y0);
  // downlights under the roof's overhang along the street, each washing the wall below it
  for (let x = H1.x0 + 0.9; x < towerX0 - 0.4; x += 1.9) {
    box(light, { x0: x - 0.07, x1: x + 0.07, z0: H1.z1 + t + 0.4, z1: H1.z1 + t + 0.54 }, P2.y0 - 0.01, P2.y0 - 0.002, 0xffffff, true);
    if (!glazing.some(q => q.axis === 'x' && q.out > 0 && q.y1 > STOREY && x > q.lo - 0.3 && x < q.hi + 0.3)) quad(light, 'x', H1.z1 + t + 0.012, x - 0.5, x + 0.5, STOREY + 0.6, P2.y0, 1, BLACK, WARM.clone().multiplyScalar(0.3), 1.3, 0.25);
  }
  // ---------------------------------------------------------------- frameless glass balustrades (the balconies, the roof terrace)
  for (const pc of wallPieces(plan)) {
    if (pc.kind !== 'railing') continue;
    const l = LV.find(q => q.id === pc.level)!, y = l.y, at = pc.at - (pc.axis === 'z' ? l.dx : 0), a = (pc.axis === 'x' ? pc.x0 : pc.z0) - (pc.axis === 'x' ? l.dx : 0), b = (pc.axis === 'x' ? pc.x1 : pc.z1) - (pc.axis === 'x' ? l.dx : 0);
    const hgt = plan.edgeH?.railing ?? 1.1;
    box(trim, lineRect(pc.axis, at, a, b, -0.045, 0.045), y, y + 0.09, 0x34322f);
    box(glass, lineRect(pc.axis, at, a + 0.01, b - 0.01, -0.01, 0.01), y + 0.09, y + hgt - 0.03, 0xffffff);
    box(trim, lineRect(pc.axis, at, a, b, -0.016, 0.016), y + hgt - 0.03, y + hgt, STEEL);
  }
  // ---------------------------------------------------------------- the claustra on the stair tower's street face: oak slats in a white frame
  {
    const z0 = H0.z1 + t, x0 = towerX0 + 0.15, x1 = towerX1 + t - 0.15, yb = 0.3, yt = 2 * STOREY + 1.1, n = Math.floor((x1 - x0) / 0.11);
    for (const [a, b] of [[towerX0, x0], [x1, towerX1 + t]]) box(wall, { x0: a, x1: b, z0, z1: z0 + 0.36 }, 0, yt + 0.15, RENDER);
    box(wall, { x0: towerX0, x1: towerX1 + t, z0, z1: z0 + 0.36 }, yt, yt + 0.15, RENDER, true);
    for (let k = 0; k < n; k++) {
      // the rhythm: each slat a little deeper or shallower than the next, a ripple every six slats (the moucharabieh's touch)
      const x = x0 + (k + 0.5) * ((x1 - x0) / n), d = 0.05 + 0.05 * Math.abs(((k % 6) - 2.5) / 2.5);
      box(trim, { x0: x - 0.024, x1: x + 0.024, z0: z0 + 0.3 - d, z1: z0 + 0.3 }, yb, yt, k % 4 === 1 ? OAK2 : OAK);
    }
    for (const y of [yb, 2.2, 4.6, yt - 0.05]) box(trim, { x0, x1, z0: z0 + 0.2, z1: z0 + 0.24 }, y, y + 0.05, OAK2);
    // three uplights in the ground washing it at night
    for (let k = 0; k < 3; k++) {
      const x = x0 + (k + 0.5) * ((x1 - x0) / 3);
      box(trim, { x0: x - 0.08, x1: x + 0.08, z0: z0 + 0.42, z1: z0 + 0.58 }, 0, 0.04, BRONZE);
      quad(light, 'x', z0 + 0.305, x - 0.45, x + 0.45, yb, yb + 3.6, 1, WARM.clone().multiplyScalar(0.36), BLACK, 0.4, 1.4);
    }
  }
  // ---------------------------------------------------------------- uplights at the foot of the ground floor's walls
  const busy = (q: { axis: 'x' | 'z'; at: number; u: number; out: 1 | -1 }) => glazing.some(gz => gz.axis === q.axis && Math.abs(gz.at - q.at) < 0.4 && q.u > gz.lo - 0.35 && q.u < gz.hi + 0.35)
    || (door && door.axis === q.axis && Math.abs(door.at - q.at) < 0.4 && q.u > door.lo - 1.0 && q.u < door.hi + 1.0)
    || (q.axis === 'x' && q.out > 0 && q.u > towerX0 - 0.3);
  for (const q of uplightSpots) {
    if (busy(q)) continue;
    box(trim, lineRect(q.axis, q.at, q.u - 0.07, q.u + 0.07, q.out * 0.06, q.out * 0.2), 0, 0.04, BRONZE);
    quad(light, q.axis, q.at + q.out * 0.012, q.u - 0.5, q.u + 0.5, 0.05, P1.y0, q.out, WARM.clone().multiplyScalar(0.32), BLACK, 0.3, 1.2);
  }
  // ---------------------------------------------------------------- the pergola over the roof terrace: oak slats on dark beams, on its posts
  for (const pg of plan.pergolas ?? []) {
    const l = levelOfRoom(plan, room(pg.room)), y = l.y + pg.h, b = { x0: pg.box.x0 - l.dx, x1: pg.box.x1 - l.dx, z0: pg.box.z0, z1: pg.box.z1 };
    for (const z of [b.z0 + 0.15, b.z1 - 0.15]) box(trim, { x0: b.x0, x1: b.x1, z0: z - 0.06, z1: z + 0.06 }, y - 0.2, y, BRONZE);
    for (const x of [b.x0 + 0.15, b.x1 - 0.15]) box(trim, { x0: x - 0.06, x1: x + 0.06, z0: b.z0, z1: b.z1 }, y - 0.2, y - 0.02, BRONZE);
    for (let x = b.x0 + 0.1; x < b.x1 - 0.05; x += 0.2) box(trim, { x0: x - 0.035, x1: x + 0.035, z0: b.z0 - 0.1, z1: b.z1 + 0.1 }, y, y + 0.12, OAK);
    for (const f of plan.fixtures) if (f.kind === 'post' && f.room === pg.room) box(trim, { x0: f.box.x0 - l.dx, x1: f.box.x1 - l.dx, z0: f.box.z0, z1: f.box.z1 }, l.y, y - 0.2, BRONZE);
  }
  // ---------------------------------------------------------------- the helipad: a dark disc, a white ring, an H, lights round it
  const yRoof = 2 * STOREY + 0.02, ring = (r0: number, r1: number, y: number, c: number) => { const geo = new THREE.RingGeometry(r0, r1, 40, 1); geo.rotateX(-Math.PI / 2); trim.geometry(geo, c, HELIPAD.x, y, HELIPAD.z); };
  ring(0, HELIPAD.r, yRoof + 0.01, 0x4b4f55); ring(HELIPAD.r - 0.32, HELIPAD.r - 0.16, yRoof + 0.015, 0xf4f1e8); ring(HELIPAD.r - 0.08, HELIPAD.r, yRoof + 0.015, 0xf2c230);
  const across = Math.abs(Math.sin(HELIPAD.yaw)) > 0.5;                                    // the H's uprights along the helicopter (HELIPAD.yaw)
  for (const [a, b, w2, d2] of [[-0.62, 0, 0.32, 2.2], [0.62, 0, 0.32, 2.2], [0, 0, 0.92, 0.32]] as const) {
    const [x, z, w, d] = across ? [b, a, d2, w2] : [a, b, w2, d2];
    trim.box(w, 0.004, d, HELIPAD.x + x, yRoof + 0.015, HELIPAD.z + z, 0xf4f1e8);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, x = HELIPAD.x + Math.cos(a) * (HELIPAD.r + 0.12), z = HELIPAD.z + Math.sin(a) * (HELIPAD.r + 0.12);
    trim.cyl(0.06, 0.07, 0.04, x, yRoof, z, 0xd9dcde, 6); light.cyl(0.05, 0.05, 0.03, x, yRoof + 0.04, z, k % 3 ? 0x7fe06b : 0xffd75a, 6);
  }

  for (const [b, m, name] of [[wall, M.render, 'render'], [stone, M.stone, 'stone'], [trim, M.trim, 'trim'], [glaze, M.glaze, 'glazing'], [glass, M.glass, 'glass'], [light, M.light, 'lights']] as const) {
    const mesh = b.build(m, true, m === M.render || m === M.stone || m === M.trim); if (!mesh) continue;
    if (m === M.glass) mesh.renderOrder = 2;
    if (m === M.light) { mesh.renderOrder = 3; mesh.receiveShadow = false; }
    // the render and the travertine a little brighter than their vertex colours can say (a white that stays white under the street's tone mapping)
    if (m === M.render || m === M.stone) { const c = mesh.geometry.attributes.color as THREE.BufferAttribute; for (let i = 0; i < c.array.length; i++) (c.array as Float32Array)[i] *= m === M.render ? 1.4 : 1.08; }
    mesh.name = `villa-facade:${name}`;
    g.add(mesh);
  }
  return g;
}
