import * as THREE from 'three';
import { Batch } from '../world/batch';
import { addGrain } from '../world/grain';
import { plasterTexture } from '../world/textures';
import { HELIPAD, STOREY } from './villa';
import { VILLA_PLAN } from './villaPlan';
import { edgeHeights, levelOfRoom, wallPieces, type FloorPlan, type Rect, type Window } from './plan';

/**
 * LD2.0-D (docs/ld2/LD2_D.md): the villa as seen from the street, drawn from the same plan as its interior (src/housing/villaPlan.ts): its outside
 * walls on both storeys with the windows and the glazed doors where the rooms have them, the front door and its porch, the slab bands between the
 * storeys, the two balconies (their slab and glass railing), the roof's parapet, the stair head with its own roof, the helipad's marking and its edge
 * lights (the helicopter is added by the street compound, src/world/helicopter.ts). Lane V-E places it on the lot.
 *
 * Local frame: the lot's plan coordinates (house x −8…8, z −5…4, +z toward the street), y 0 the ground. Four draw calls: the render, the trims and
 * glazing (opaque, tinted), the balconies' glass, the lights (`lamps`: the street's lamp material, so they glow with the street at night; else a
 * warm material of its own).
 */
const RENDER = 0xf4efe6, BAND = 0xc9b79a, COPING = 0xe9e0cf, ALU = 0x2e3236, GLAZE = 0x3b5466, PLINTH = 0x9b8f7e, DOOR = 0x6e4426, TERRACE = 0xd9cbb0;
let mats: { wall: THREE.Material; plain: THREE.Material; glass: THREE.Material; light: THREE.Material } | null = null;
function materials() {
  if (mats) return mats;
  mats = {
    wall: addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.16, 1, false, plasterTexture(), 3),
    plain: addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.3, 2),
    glass: new THREE.MeshLambertMaterial({ color: 0xbfe6f2, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    light: new THREE.MeshBasicMaterial({ color: 0xffe7b0 }),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}

export function buildVillaFacade(lamps?: THREE.Material, plan: FloorPlan = VILLA_PLAN): THREE.Group {
  const g = new THREE.Group(); g.name = 'villa-facade';
  const M = materials(), wall = new Batch(), plain = new Batch(), glass = new Batch(), light = new Batch();
  const H = plan.wallH, SLAB = STOREY - H, PL = 0.15;                                         // walls, the slab between storeys, the plinth
  const room = (id: string) => plan.rooms.find(r => r.id === id)!;
  /** A box over a rect of a level (house metres: plan x less the level's dx), from y0 to y1 above the ground. */
  const box = (b: Batch, r: Rect, dx: number, y0: number, y1: number, c: number) => {
    if (r.x1 - r.x0 < 1e-4 || r.z1 - r.z0 < 1e-4 || y1 - y0 < 1e-4) return;
    b.box(r.x1 - r.x0, y1 - y0, r.z1 - r.z0, (r.x0 + r.x1) / 2 - dx, y0, (r.z0 + r.z1) / 2, c);
  };
  const lineRect = (axis: 'x' | 'z', at: number, a: number, b: number, c0: number, c1: number): Rect => axis === 'x'
    ? { x0: Math.min(a, b), x1: Math.max(a, b), z0: at + Math.min(c0, c1), z1: at + Math.max(c0, c1) }
    : { x0: at + Math.min(c0, c1), x1: at + Math.max(c0, c1), z0: Math.min(a, b), z1: Math.max(a, b) };
  const edgeH = edgeHeights(plan), top = (plan.levels?.length ?? 1) - 1;

  // ---------------------------------------------------------------- the outside walls, storey by storey, cut where the windows and doors are
  const windowsOn = (axis: 'x' | 'z', at: number) => plan.windows.flatMap((w: Window) => {
    const b = room(w.room).box, line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side], wa = w.side === 'n' || w.side === 's' ? 'x' : 'z';
    return wa === axis && Math.abs(line - at) < 1e-6 ? [w] : [];
  });
  for (const pc of wallPieces(plan)) {
    const l = plan.levels!.find(q => q.id === pc.level)!, li = plan.levels!.indexOf(l), dx = l.dx, y = l.y, t = (pc.axis === 'x' ? pc.z1 - pc.z0 : pc.x1 - pc.x0) / 2;
    const a = pc.axis === 'x' ? pc.x0 : pc.z0, b = pc.axis === 'x' ? pc.x1 : pc.z1;
    if (pc.kind === 'garden') continue;                                                          // the lot's own walls are the street compound's (lane V-E)
    if (pc.kind === 'parapet') {
      const h = edgeH[pc.kind];
      box(wall, pc, dx, y, y + h, RENDER);
      box(plain, lineRect(pc.axis, pc.at, a - 0.03, b + 0.03, -t - 0.04, t + 0.04), dx, y + h, y + h + 0.07, COPING);
      continue;
    }
    if (pc.kind === 'railing') {
      box(glass, lineRect(pc.axis, pc.at, a + 0.03, b - 0.03, -0.012, 0.012), dx, y + 0.1, y + edgeH.railing - 0.06, 0xffffff);
      box(plain, lineRect(pc.axis, pc.at, a, b, -0.045, 0.045), dx, y + edgeH.railing - 0.05, y + edgeH.railing, ALU);
      box(plain, pc, dx, y, y + 0.1, COPING);
      const n = Math.max(1, Math.round((b - a) / 1.3));
      for (let k = 0; k <= n; k++) { const c = a + (k / n) * (b - a); box(plain, lineRect(pc.axis, pc.at, c - 0.03, c + 0.03, -0.03, 0.03), dx, y + 0.1, y + edgeH.railing, ALU); }
      continue;
    }
    if (!pc.outer) continue;                                                                    // inside walls are not seen from the street
    // its colour: the house's render, or the accent of the room it closes (a stone-clad entrance, a wood-clad stair head), stretch by stretch
    const colourAt = (u2: number) => plan.rooms.find(r => !r.outdoor && [-1, 1].some(sg => { const x = pc.axis === 'x' ? u2 : pc.at + sg * (t + 0.05), z = pc.axis === 'x' ? pc.at + sg * (t + 0.05) : u2; return x > r.box.x0 && x < r.box.x1 && z > r.box.z0 && z < r.box.z1; }))?.facade ?? RENDER;
    const cuts = [a, b];
    for (const r of plan.rooms) for (const e of pc.axis === 'x' ? [r.box.x0, r.box.x1] : [r.box.z0, r.box.z1]) if (e > a + 1e-6 && e < b - 1e-6) cuts.push(e);
    cuts.sort((p2, q) => p2 - q);
    const wall2 = (u0: number, u1: number, ya: number, yb: number) => {
      for (let i = 0; i + 1 < cuts.length; i++) { const s0 = Math.max(u0, cuts[i]), s1 = Math.min(u1, cuts[i + 1]); if (s1 - s0 > 1e-4) box(wall, lineRect(pc.axis, pc.at, s0, s1, -t, t), dx, ya, yb, colourAt((s0 + s1) / 2)); }
    };
    // the storey's wall, less its windows (a sill below, a lintel above, tinted glass in a dark frame between)
    let u = a;
    const y0 = y + (li === 0 ? PL : 0), wins = windowsOn(pc.axis, pc.at).filter(w => w.at - w.width / 2 >= a - 1e-6 && w.at + w.width / 2 <= b + 1e-6).sort((p2, q) => p2.at - q.at);
    for (const w of wins) {
      const lo = w.at - w.width / 2, hi = w.at + w.width / 2;
      wall2(u, lo, y0, y + H); wall2(lo, hi, y0, y + w.sill); wall2(lo, hi, y + w.sill + w.height, y + H);
      box(plain, lineRect(pc.axis, pc.at, lo, hi, -0.02, 0.02), dx, y + w.sill, y + w.sill + w.height, GLAZE);
      for (const e of [lo, (lo + hi) / 2 - 0.025, hi - 0.05]) box(plain, lineRect(pc.axis, pc.at, e, e + 0.05, -t - 0.01, t + 0.01), dx, y + w.sill, y + w.sill + w.height, ALU);
      box(plain, lineRect(pc.axis, pc.at, lo - 0.04, hi + 0.04, -t - 0.06, t + 0.06), dx, y + w.sill - 0.05, y + w.sill, COPING);
      u = hi;
    }
    wall2(u, b, y0, y + H);
    // the slab between this storey and the next (a band proud of the render), or the stair head's roof
    if (li < top) box(plain, lineRect(pc.axis, pc.at, a - 0.04, b + 0.04, -t - 0.03, t + 0.03), dx, y + H, y + STOREY, BAND);
    else box(plain, lineRect(pc.axis, pc.at, a - 0.04, b + 0.04, -t - 0.03, t + 0.03), dx, y + H, y + H + 0.25, BAND);
    if (li === 0) box(plain, lineRect(pc.axis, pc.at, a, b, -t - 0.02, t + 0.02), dx, 0, PL, PLINTH);
  }
  // the openings in the outside walls: their lintel, and what fills them (a glazed door's tinted glass, the front door)
  for (const o of plan.openings) {
    const ra = room(o.a), rb = o.b === 'out' ? null : room(o.b), outer = !rb || !!ra.outdoor || !!rb.outdoor; if (!outer) continue;
    const l = levelOfRoom(plan, ra), dx = l.dx, y = l.y, at = o.axis === 'x' ? o.z : o.x, c = o.axis === 'x' ? o.x : o.z, lo = c - o.width / 2, hi = c + o.width / 2, t = plan.outWall / 2;
    box(wall, lineRect(o.axis, at, lo, hi, -t, t), dx, y + o.height, y + H, (ra.outdoor ? rb : ra)?.facade ?? RENDER);
    if (o.kind === 'front') {
      box(plain, lineRect(o.axis, at, lo, hi, -0.03, 0.03), dx, y + PL, y + o.height, DOOR);
      for (const e of [lo - 0.09, hi]) box(plain, lineRect(o.axis, at, e, e + 0.09, -t - 0.03, t + 0.03), dx, y, y + o.height + 0.09, ALU);
      box(plain, lineRect(o.axis, at, lo - 0.09, hi + 0.09, -t - 0.03, t + 0.03), dx, y + o.height, y + o.height + 0.09, ALU);
      box(plain, lineRect(o.axis, at, hi - 0.2, hi - 0.15, 0.03, 0.08), dx, y + 0.9, y + 1.4, 0xd4b24a);                    // a long brass handle
      // the porch: two steps up to the door, a lamp each side
      box(plain, lineRect(o.axis, at, lo - 0.7, hi + 0.7, t, t + 1.3), dx, 0, PL, COPING);
      box(plain, lineRect(o.axis, at, lo - 0.9, hi + 0.9, t + 1.3, t + 1.8), dx, 0, PL / 2, COPING);
      for (const e of [lo - 0.35, hi + 0.25]) box(light, lineRect(o.axis, at, e, e + 0.1, t, t + 0.08), dx, y + 1.7, y + 2.05, 0xffffff);
      continue;
    }
    if (o.kind !== 'glass') continue;
    box(plain, lineRect(o.axis, at, lo, hi, -0.02, 0.02), dx, y + PL * (l.y === 0 ? 1 : 0), y + o.height, GLAZE);
    for (const e of [lo - 0.06, (lo + hi) / 2 - 0.03, hi]) box(plain, lineRect(o.axis, at, e, e + 0.06, -t - 0.01, t + 0.01), dx, y, y + o.height + 0.06, ALU);
    box(plain, lineRect(o.axis, at, lo - 0.06, hi + 0.06, -t - 0.01, t + 0.01), dx, y + o.height, y + o.height + 0.06, ALU);
  }
  // ---------------------------------------------------------------- floors seen from above: the balconies' slabs, the roof terrace, the stair head's roof
  for (const r of plan.rooms) {
    const l = levelOfRoom(plan, r); if (l.y === 0) continue;
    if (r.outdoor) box(plain, r.box, l.dx, l.y - SLAB, l.y + 0.02, r.kind === 'balcon' ? BAND : TERRACE);
    else if (l === plan.levels![top]) box(plain, { x0: r.box.x0 - 0.15, x1: r.box.x1 + 0.15, z0: r.box.z0 - 0.15, z1: r.box.z1 + 0.15 }, l.dx, l.y + H + 0.25 - 0.001, l.y + H + 0.3, COPING);
  }
  // the house's roof under the terrace (the etage's ceiling), where the terrace's own floor does not reach (under the stair head it is the floor)
  // ---------------------------------------------------------------- the helipad: a dark disc, a white ring, an H, lights round it
  const yRoof = 2 * STOREY + 0.02, ring = (r0: number, r1: number, y: number, c: number) => { const geo = new THREE.RingGeometry(r0, r1, 40, 1); geo.rotateX(-Math.PI / 2); plain.geometry(geo, c, HELIPAD.x, y, HELIPAD.z); };
  ring(0, HELIPAD.r, yRoof + 0.01, 0x4b4f55); ring(HELIPAD.r - 0.32, HELIPAD.r - 0.16, yRoof + 0.015, 0xf4f1e8); ring(HELIPAD.r - 0.08, HELIPAD.r, yRoof + 0.015, 0xf2c230);
  for (const [x, z, w, d] of [[-0.62, 0, 0.32, 2.2], [0.62, 0, 0.32, 2.2], [0, 0, 0.92, 0.32]] as const) plain.box(w, 0.004, d, HELIPAD.x + x, yRoof + 0.015, HELIPAD.z + z, 0xf4f1e8);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; light.cyl(0.05, 0.07, 0.07, HELIPAD.x + Math.cos(a) * (HELIPAD.r + 0.12), yRoof, HELIPAD.z + Math.sin(a) * (HELIPAD.r + 0.12), 0xffffff, 8); }

  for (const [b, m, cast] of [[wall, M.wall, true], [plain, M.plain, true], [glass, M.glass, false], [light, lamps ?? M.light, false]] as const) {
    const mesh = b.build(m, true, cast); if (!mesh) continue;
    if (m === M.glass) mesh.renderOrder = 2;
    mesh.name = `villa-facade:${b === wall ? 'wall' : b === plain ? 'trim' : b === glass ? 'glass' : 'lights'}`;
    g.add(mesh);
  }
  return g;
}
