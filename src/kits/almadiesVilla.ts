import * as THREE from 'three';
import { Batch } from '../world/batch';
import {
  COMPOUND_PALETTE, GROUND, HOUSE_NUMBER, buildEntrance, buildVillaCompound, drawBays, drawBoundaryWall, drawCarGate, drawFrontGarden, drawFrontPalms,
  drawLawns, drawPoolDeck, makeDraw, planFrame, type CompoundKit, type CompoundPalette, type Draw, type Facing, type Frame, type LotSize, type VillaCompound,
} from '../world/villaCompound';
import { buildVillaFacade } from '../housing/villaFacade';
import { VILLA_PLAN } from '../housing/villaPlan';
import { VILLA_ALMADIES_LAYOUT } from '../housing/villaLayout';
import { HELIPAD, LOT, STOREY, VILLA_ID } from '../housing/villa';
import { toWorld } from '../housing/plan';
import { buildHelicopter } from '../world/helicopter';
import { buildHomeInterior } from '../economy/homeInterior';
import { furnitureSpec, homeSpec } from '../economy/catalog';
import { installFurnitureKit } from '../economy/furnitureKitAdapter';
import { furnitureModel } from '../economy/furnitureModels';

/**
 * LD2.0-D round 2, lane R2-E: the Almadies villa kit (the owner, 27 Oct: « Save all the assets for the villa, we will replicate this design to other
 * houses to give Almadies the luxurious feel »). The catalogue: docs/kits/ALMADIES_VILLA_KIT.md; each piece as a GLB: docs/kits/almadies-villa/glb/
 * (scripts/export-villa-kit.mjs).
 *
 * A thin layer over the builders the flagship villa is drawn with: it names every piece, says what it is built by and with what, and builds the whole
 * villa on any Almadies lot from one spec (`buildAlmadiesVilla`). Nothing here is drawn its own way: the street compound's pieces are
 * src/world/villaCompound.ts's, the house is lane V-S's façade and plan (src/housing/villaFacade.ts, villaPlan.ts), the helicopter is
 * src/world/helicopter.ts's `buildHelicopter` (lane R2-H rebuilds it behind the same call), the furniture is the game's own models. With the flagship's
 * spec it builds the flagship exactly (tests/villaKit.test.ts). It places nothing in the city: building other lots from it is the next step.
 *
 * The spec (`AlmadiesVillaSpec`), what each part changes:
 *  - `lot`: the lot's rectangle in the hub. The Almadies' lots are 22 × 22 m (src/world/builder.ts LS); a larger one (each side ≥ 22) widens the
 *    street wall and the lawns and deepens the back garden; the gate, the entrance, the bays, the front garden and the house keep their places from
 *    the street.
 *  - `facing`: the side of the lot on the street (south: +z, the flagship's; north, east, west): the whole villa turns to face it.
 *  - `mirror`: the villa mirrored, the car gate on the west and the main entrance on the east (the house number still reads the right way).
 *  - `palette`: any colour of the compound (its walls, stone, gate, lawns, flowers, the entrance's travertine, teak and bronze...), and the house's
 *    render and travertine (`render`, `travertine`: the façade's vertex colours tinted).
 *  - `storeys`: 1, 2 (the flagship's) or 3: the façade's first-floor band dropped or repeated, the roof (its terrace, pergola, helipad, helicopter)
 *    and everything that rises through it (the stair tower's claustra) following; the house's solid box with it. The interior plan stays the
 *    flagship's three levels: another storey count is drawn in the street only.
 *  - `pool`: the pool in the back garden, or the deck over its place.
 *  - `helipad`: the pad on the roof and the helicopter on it, or a plain roof terrace.
 *  - `number`: the house number on the main entrance's lintel.
 */
export interface AlmadiesVillaSpec {
  lot: { x0: number; x1: number; z0: number; z1: number };
  facing: Facing;
  mirror: boolean;
  palette: Partial<VillaPalette>;
  storeys: 1 | 2 | 3;
  pool: boolean;
  helipad: boolean;
  number: string;
}
/** The compound's colours, and the house's render and travertine. */
export type VillaPalette = CompoundPalette & { render: number; travertine: number };
/** The house's own tones as lane V-S drew them (src/housing/villaFacade.ts RENDER, CLAD): the palette's `render` and `travertine` tint from them. */
export const FACADE_TONES = { render: 0xf8f4ec, travertine: 0xe4d2b2 } as const;
/** The flagship: the Almadies block (1,1) lot 3 (src/housing/villa.ts LOT), facing south. */
export const FLAGSHIP: AlmadiesVillaSpec = {
  lot: { x0: LOT.cx - LOT.w / 2, x1: LOT.cx + LOT.w / 2, z0: LOT.cz - LOT.d / 2, z1: LOT.cz + LOT.d / 2 },
  facing: 'south', mirror: false, palette: {}, storeys: 2, pool: true, helipad: true, number: HOUSE_NUMBER,
};
/** The smallest lot the villa stands on (m): the house, its front yard and its back garden. */
export const MIN_LOT = 22;

/** The plan's frame and the lot's size for a lot rectangle and the side on the street (the street wall 11 m in front of the plan's origin). */
export function lotFrame(lot: AlmadiesVillaSpec['lot'], facing: Facing = 'south', mirror = false): { frame: Frame; size: LotSize } {
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2, E = MIN_LOT / 2;
  const across = facing === 'south' || facing === 'north' ? lot.x1 - lot.x0 : lot.z1 - lot.z0, deep = facing === 'south' || facing === 'north' ? lot.z1 - lot.z0 : lot.x1 - lot.x0;
  if (across < MIN_LOT - 1e-6 || deep < MIN_LOT - 1e-6) throw new Error(`Almadies villa kit: the lot is ${across} × ${deep} m, the villa needs at least ${MIN_LOT} × ${MIN_LOT}`);
  const at = facing === 'south' ? { x: cx, z: lot.z1 - E } : facing === 'north' ? { x: cx, z: lot.z0 + E } : facing === 'east' ? { x: lot.x1 - E, z: cz } : { x: lot.x0 + E, z: cz };
  return { frame: planFrame(at, facing, mirror), size: { w: across, d: deep } };
}

// ------------------------------------------------------------------------------------------------ the house: the façade for a spec
/** Every triangle of a non-indexed geometry, kept, dropped, moved or doubled by `edit` (`y`: its three heights; returns the copies to add). */
function editTriangles(geo: THREE.BufferGeometry, edit: (y: [number, number, number], p: Float32Array, i: number) => { keep: boolean; dy?: number; map?: (y: number) => number; copy?: number }) {
  const g = geo.index ? geo.toNonIndexed() : geo, names = Object.keys(g.attributes), n = g.attributes.position.count / 3;
  const src = Object.fromEntries(names.map(k => [k, g.attributes[k] as THREE.BufferAttribute]));
  const out: Record<string, number[]> = Object.fromEntries(names.map(k => [k, []]));
  const pos = src.position.array as Float32Array;
  const put = (t: number, yOf: (y: number) => number) => {
    for (const k of names) {
      const a = src[k], s = a.itemSize;
      for (let v = 0; v < 3; v++) for (let c = 0; c < s; c++) { const x = a.array[(t * 3 + v) * s + c]; out[k].push(k === 'position' && c === 1 ? yOf(x) : x); }
    }
  };
  for (let t = 0; t < n; t++) {
    const y: [number, number, number] = [pos[t * 9 + 1], pos[t * 9 + 4], pos[t * 9 + 7]];
    const e = edit(y, pos, t);
    if (e.keep) put(t, e.map ?? (e.dy ? (v: number) => v + e.dy! : (v: number) => v));
    if (e.copy !== undefined) put(t, v => v + e.copy!);
  }
  const res = new THREE.BufferGeometry();
  for (const k of names) res.setAttribute(k, new THREE.Float32BufferAttribute(out[k], src[k].itemSize));
  res.computeBoundingSphere(); res.computeBoundingBox();
  return res;
}
/** Is a triangle wholly inside a box of the façade's frame (house metres, y up)? */
const inside = (p: Float32Array, t: number, b: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }) => {
  for (let v = 0; v < 3; v++) { const x = p[t * 9 + v * 3], y = p[t * 9 + v * 3 + 1], z = p[t * 9 + v * 3 + 2]; if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1 || z < b.z0 || z > b.z1) return false; }
  return true;
};
/** The helipad's marks and lights on the roof (the façade's frame): a disc a little wider than the pad, its paint and lights only. */
const PAD_BOX = { x0: HELIPAD.x - HELIPAD.r - 0.3, x1: HELIPAD.x + HELIPAD.r + 0.3, y0: 2 * STOREY + 0.005, y1: 2 * STOREY + 0.12, z0: HELIPAD.z - HELIPAD.r - 0.3, z1: HELIPAD.z + HELIPAD.r + 0.3 };
const onPad = (p: Float32Array, t: number) => {
  if (!inside(p, t, PAD_BOX)) return false;
  for (let v = 0; v < 3; v++) if (Math.hypot(p[t * 9 + v * 3] - HELIPAD.x, p[t * 9 + v * 3 + 2] - HELIPAD.z) > HELIPAD.r + 0.3) return false;
  return true;
};
/** The roof terrace's pergola (src/housing/villaPlan.ts `pergolas`) in the façade's frame: its posts, beams and slats. */
export const PERGOLA_BOX = (() => { const pg = VILLA_PLAN.pergolas![0], dx = VILLA_PLAN.levels!.find(l => l.id === 'toit')!.dx; return { x0: pg.box.x0 - dx - 0.2, x1: pg.box.x1 - dx + 0.2, y0: 2 * STOREY - 0.001, y1: 2 * STOREY + pg.h + 0.2, z0: pg.box.z0 - 0.2, z1: pg.box.z1 + 0.2 }; })();

/**
 * The house's façade for a spec: lane V-S's (`buildVillaFacade`, from the villa's plan), then, for another storey count, its first-floor band
 * (STOREY…2 × STOREY) dropped or repeated, what stands on the roof moved with it and what rises through it stretched; without the helipad, its marks
 * and lights taken off the roof; the render and the travertine tinted to the palette.
 */
export function villaFacadeFor(spec: Pick<AlmadiesVillaSpec, 'storeys' | 'helipad' | 'palette'>): THREE.Group {
  const g = buildVillaFacade();
  const S = STOREY, roof = 2 * S, eps = 0.002, more = spec.storeys - 2;
  const tint = (name: string, to: number | undefined, from: number) => {
    if (to === undefined || to === from) return null;
    const a = new THREE.Color(to), b = new THREE.Color(from);
    return [a.r / Math.max(b.r, 1e-3), a.g / Math.max(b.g, 1e-3), a.b / Math.max(b.b, 1e-3), name] as const;
  };
  const tints = [tint('render', spec.palette.render, FACADE_TONES.render), tint('stone', spec.palette.travertine, FACADE_TONES.travertine)].filter(Boolean) as (readonly [number, number, number, string])[];
  for (const o of [...g.children]) {
    const m = o as THREE.Mesh; if (!m.isMesh) continue;
    let geo = m.geometry;
    if (!spec.helipad) geo = editTriangles(geo, (_y, p, t) => ({ keep: !onPad(p, t) }));
    if (more) geo = editTriangles(geo, ([a, b, c]) => {
      const lo = Math.min(a, b, c), hi = Math.max(a, b, c);
      const band = lo >= S - eps && hi <= roof + eps, above = lo >= roof - eps && hi > roof + eps, across = lo < roof - eps && hi > roof + eps;
      if (more > 0) return above ? { keep: true, dy: S * more } : across ? { keep: true, map: y => (y > roof + eps ? y + S * more : y) } : band ? { keep: true, copy: S } : { keep: true };
      // one storey: the band goes, the roof comes down onto the ground floor's slab, what rose through it shrinks with it
      return band ? { keep: false } : above ? { keep: true, dy: -S } : { keep: true, map: y => (y > roof + eps ? y - S : y > S ? S : y) };
    });
    for (const [r, gg, bb, name] of tints) if (m.name === `villa-facade:${name}`) {
      const col = geo.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * r, col.getY(i) * gg, col.getZ(i) * bb);
    }
    if (geo !== m.geometry) { m.geometry.dispose(); m.geometry = geo; }
  }
  return g;
}

// ------------------------------------------------------------------------------------------------ the whole villa on a lot
/** The compound's options for a spec. */
export function compoundOptions(spec: Partial<AlmadiesVillaSpec> = {}) {
  const s: AlmadiesVillaSpec = { ...FLAGSHIP, ...spec, palette: { ...spec.palette } };
  const { frame, size } = lotFrame(s.lot, s.facing, s.mirror);
  const { render: _r, travertine, ...compound } = s.palette;
  const palette: Partial<CompoundPalette> = { ...(travertine !== undefined ? { clad: travertine } : {}), ...compound };
  const flagshipHouse = s.storeys === 2 && s.helipad && _r === undefined && travertine === undefined;
  return {
    spec: s, frame, size, palette, pool: s.pool, number: s.number,
    house: { facade: flagshipHouse ? undefined : () => villaFacadeFor(s), roof: s.storeys * STOREY, heli: s.helipad },
  };
}
/**
 * The whole villa on a lot of a hub, drawn into the hub's batches (the kit, as src/world/builder.ts hands it to the flagship): the wall, the car gate,
 * the lawns, the bays, the front garden, the main entrance, the palms, the house and its helicopter, the pool deck; its colliders, canopies, the ground
 * kept open, its gate and door rigs. The flagship's spec draws the flagship exactly.
 */
export function buildAlmadiesVilla(kit: CompoundKit, spec: Partial<AlmadiesVillaSpec> = {}): VillaCompound {
  const o = compoundOptions(spec);
  return buildVillaCompound(kit, { frame: o.frame, size: o.size, palette: o.palette, pool: o.pool, number: o.number, house: o.house });
}

// ------------------------------------------------------------------------------------------------ the pieces, each on its own
/** Materials for a piece drawn on its own (the kit's viewer, its GLB files): plain vertex colours, the bulbs lit, the water a little clear. */
let soloMats: { plain: THREE.Material; leaves: THREE.Material; water: THREE.Material; bulbs: THREE.Material } | null = null;
export function soloMaterials() {
  if (soloMats) return soloMats;
  const lam = (o: THREE.MeshLambertMaterialParameters = {}) => { const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...o }); m.userData.shared = true; return m; };
  const bulbs = new THREE.MeshBasicMaterial({ vertexColors: true }); bulbs.userData.shared = true;
  soloMats = { plain: lam(), leaves: lam({ side: THREE.DoubleSide }), water: lam({ transparent: true, opacity: 0.85 }), bulbs };
  return soloMats;
}
/** A drawing context on its own batches at the plan's origin (facing south), and how to turn them into meshes. */
export function soloDraw(spec: Partial<AlmadiesVillaSpec> = {}, lite = false) {
  const M = soloMaterials(), pools: { x: number; z: number; r: number }[] = [];
  const kit: CompoundKit = { lite, plain: new Batch(), pave: new Batch(), leaves: new Batch(), trunks: new Batch(), water: new Batch(), bulbs: new Batch(), metalMat: M.plain, pool: (x, z, r) => { pools.push({ x, z, r }); } };
  const o = compoundOptions({ ...spec, lot: { x0: -MIN_LOT / 2, x1: MIN_LOT / 2, z0: -MIN_LOT / 2, z1: MIN_LOT / 2 } });
  const d = makeDraw(kit, o.frame, o.size, o.palette);
  const meshes = (name: string) => {
    const g = new THREE.Group(); g.name = name;
    for (const [key, mat] of [['plain', M.plain], ['pave', M.plain], ['leaves', M.leaves], ['trunks', M.plain], ['water', M.water], ['bulbs', M.bulbs]] as const) {
      const m = kit[key].build(mat, true, key !== 'bulbs'); if (m) { m.name = `${name}:${key}`; g.add(m); }
    }
    return g;
  };
  return { d, kit, meshes, pools, options: o };
}
/** One piece of the kit: what it is, what builds it, its parameters, and how to build it on its own (at the plan's origin, facing south). */
export interface KitPiece {
  id: string;
  /** Its name in the catalogue (French, as the game says it). */
  name: string;
  /** What builds it in the game (module and function). */
  builder: string;
  what: string;
  /** Its parameters and what each changes. */
  params: Record<string, string>;
  /** Draw calls it costs the district in the game (its own meshes; the rest joins the district's merged batches). */
  street: string;
  build(spec?: Partial<AlmadiesVillaSpec>): THREE.Object3D;
}
/** The façade's triangles inside a box of its frame (the pergola, the helipad): a piece of lane V-S's house, cut out of it. */
function cutFacade(name: string, keep: (p: Float32Array, t: number) => boolean) {
  const g = buildVillaFacade(), out = new THREE.Group(); out.name = name;
  for (const o of [...g.children]) {
    const m = o as THREE.Mesh; if (!m.isMesh) continue;
    const geo = editTriangles(m.geometry, (_y, p, t) => ({ keep: keep(p, t) }));
    m.geometry.dispose();
    if (geo.attributes.position.count) { const c = new THREE.Mesh(geo, m.material); c.name = `${name}:${m.name.split(':')[1]}`; out.add(c); } else geo.dispose();
  }
  return out;
}
const piece = (name: string, draw: (d: Draw) => THREE.Object3D[] | void) => (spec: Partial<AlmadiesVillaSpec> = {}) => {
  const s = soloDraw(spec), extra = draw(s.d) ?? [], g = s.meshes(name);
  for (const o of extra) g.add(o);
  g.userData.pools = s.pools;
  return g;
};

export const ALMADIES_VILLA_PIECES: readonly KitPiece[] = [
  {
    id: 'plan', name: 'Le plan (trois niveaux)', builder: 'src/housing/villaPlan.ts VILLA_PLAN, built by src/economy/homeInterior.ts buildHomeInterior (src/housing/apartment.ts)',
    what: 'The floor plan both the interior and the façade are drawn from: the ground floor (entrée, grand salon, salle à manger, cuisine, bureau, hall, salle d’eau, the back garden and its pool), the first floor (salon familial, suite parentale with dressing and bath, two bedrooms, bathroom, two balconies), the roof terrace (helipad, pergola, stair head); two straight flights. Its 3D form is the interior shell.',
    params: { plan: 'a FloorPlan (src/housing/plan.ts, version 2 with levels): rooms, openings, windows, fixtures, stairs, pergolas, marks' },
    street: 'none (the interior, off the street grid)',
    build: () => buildPlanShell(),
  },
  {
    id: 'facade', name: 'La façade et ses finitions', builder: 'src/housing/villaFacade.ts buildVillaFacade (from VILLA_PLAN); this kit\'s villaFacadeFor',
    what: 'The house seen from the street: the travertine ground floor, the ivory render above, thin white slabs, floor-to-ceiling glazing in slim dark frames, frameless glass balustrades, the oak claustra of the stair tower, the teak front door in its bronze portal, and its night lights (warm windows, uplights, the roof\'s line of light). Its finishes: src/housing/villaFinish.ts (travertine slabs, oak boards, the window view).',
    params: { storeys: '1, 2 or 3: the first-floor band dropped or repeated, the roof following', helipad: 'the pad\'s marks and lights on the roof, or not', 'palette.render / palette.travertine': 'the render\'s and the travertine\'s tones' },
    street: '6 draw calls (render, travertine, trims, glazing, glass, lights)',
    build: spec => villaFacadeFor({ ...FLAGSHIP, ...spec, palette: { ...spec?.palette } }),
  },
  {
    id: 'wall', name: 'Le mur d’enceinte', builder: 'src/world/villaCompound.ts drawBoundaryWall',
    what: 'The 2.4 m wall on the lot\'s four edges with its plinth and coping, broken by the car gate and the main entrance; the side strips closed from the house; travertine pillars (a big one at the corner), the gate\'s lantern pillars, the plaque and letter box; bougainvillea spilling over. Solid.',
    params: { lot: 'its edges (a larger lot: longer runs, more pillars)', 'palette.wall / plinth / coping / stone / stoneDark / bloom / hedge': 'its colours' },
    street: '0 (the district\'s merged batches)',
    build: piece('wall', d => { drawBoundaryWall(d); }),
  },
  {
    id: 'carGate', name: 'Le portail coulissant (voitures)', builder: 'src/world/villaCompound.ts drawCarGate; slideGate moves it (src/villa/module.ts)',
    what: 'The telescopic car gate: two slatted anthracite half panels on two tracks; open, they stow between the main entrance and the gate. Its own mesh and its moving box; the dropped kerb before it and its pools of light. Opens for the villa\'s people (src/villa/gate.ts gateWants).',
    params: { 'palette.frame / slat / rail / apron': 'its colours', mirror: 'it stows the other way' },
    street: '1 draw call (its own mesh)',
    build: piece('carGate', d => { const g = drawCarGate(d); return [g.mesh]; }),
  },
  {
    id: 'entrance', name: 'L’entrée principale', builder: 'src/world/villaCompound.ts buildEntrance; swingEntrance turns its door (src/villa/module.ts, the rule src/villa/gate.ts entranceWants)',
    what: 'The main door for people, in line with the front door: a travertine portal 0.8 m above the wall, a pivoting teak and bronze door, a slim canopy with a line of light, the house number in bronze, an intercom, light bars; the straight travertine path to the forecourt, lit flush in its edges.',
    params: { number: 'the house number on its lintel', 'palette.clad / door / bronze / pull / slab': 'its travertine, teak, bronze and canopy', mirror: 'its door turns the other way' },
    street: '2 draw calls (its travertine with the path, its door)',
    build: spec => { const s = soloDraw(spec), e = buildEntrance(s.d, { number: spec?.number }), g = s.meshes('entrance'); g.add(e.stone, e.rig.mesh); return g; },
  },
  {
    id: 'bays', name: 'Les deux places de parking', builder: 'src/world/villaCompound.ts drawBays (src/housing/villa.ts BAYS; « Garer à la villa »: src/villa/bays.ts)',
    what: 'The paved driveway from the gate to the house, two marked bays of 2.6 × 5.4 m for SUVs facing the house, their wheel stops.',
    params: { 'palette.drive / line / stop': 'its colours' },
    street: '0 (the district\'s merged batches)',
    build: piece('bays', d => { drawBays(d); }),
  },
  {
    id: 'frontGarden', name: 'Le jardin de devant', builder: 'src/world/villaCompound.ts drawLawns, drawFrontGarden, drawFrontPalms (drawPalm)',
    what: 'The mown lawns, the forecourt to the front door and its step, stepping stones from the gate to the path, the planted stone bed along the house, the hedge inside the wall, garden bollards and their pools at night, four palms with uplights.',
    params: { lot: 'its lawns fill a larger lot', 'palette.lawn / lawn2 / fore / step / bed / hedge / post / bark / frond': 'its colours' },
    street: '0 (the district\'s merged batches)',
    build: piece('frontGarden', d => { drawLawns(d); drawFrontGarden(d); drawFrontPalms(d); }),
  },
  {
    id: 'poolDeck', name: 'La piscine et sa terrasse', builder: 'src/world/villaCompound.ts drawPoolDeck (src/housing/villa.ts POOL; the swim: src/villa/swim.ts)',
    what: 'The back garden: the deck, the 10 × 3.6 m pool with its white coping and water (lit at night), three teak loungers and a parasol, potted plants, the back hedge, two palms in the corners.',
    params: { pool: 'the pool, or the deck over its place', lot: 'a deeper lot: a deeper deck', 'palette.deck / rim / water / teak / cushion': 'its colours' },
    street: '0 (the district\'s merged batches)',
    build: spec => piece('poolDeck', d => { drawPoolDeck(d, spec?.pool ?? true); })(spec),
  },
  {
    id: 'pergola', name: 'La pergola du toit', builder: 'src/housing/villaFacade.ts buildVillaFacade (VILLA_PLAN.pergolas), cut out of the façade',
    what: 'Over the roof terrace\'s street corner: oak slats on two dark bronze beams, on four posts, 2.7 m above the deck.',
    params: { 'plan.pergolas': 'where and how high (src/housing/villaPlan.ts)' },
    street: 'part of the façade\'s trims (no draw call of its own)',
    build: () => cutFacade('pergola', (p, t) => inside(p, t, PERGOLA_BOX)),
  },
  {
    id: 'helipad', name: 'L’héliport', builder: 'src/housing/villaFacade.ts buildVillaFacade (src/housing/villa.ts HELIPAD), cut out of the façade',
    what: 'On the roof: a dark disc 6.4 m across, a white ring, a yellow edge, the H, twelve lights round it (green and yellow, lit at night).',
    params: { helipad: 'on the roof or not', 'HELIPAD': 'its centre and radius' },
    street: 'part of the façade\'s trims and lights (no draw call of its own)',
    build: () => cutFacade('helipad', onPad),
  },
  {
    id: 'helicopter', name: 'L’hélicoptère', builder: 'src/world/helicopter.ts buildHelicopter (lane R2-H rebuilds it behind the same call)',
    what: 'The light helicopter parked on the pad, its nose toward the street.',
    params: { helipad: 'on its pad or not' },
    street: 'its own meshes (2 today; R2-H\'s: at most 4)',
    build: () => buildHelicopter().group,
  },
  {
    id: 'furniture', name: 'L’ameublement (Collection Almadies)', builder: 'src/housing/villaLayout.ts VILLA_ALMADIES_LAYOUT; the models src/economy/furnitureModels.ts furnitureModel (the kit: src/world/furnitureKit.ts)',
    what: 'The villa furnished room by room on its three levels (the grand salon, the dining room, the study, the entrance, the suite, the bedrooms, the family lounge, the pool deck, the roof terrace): one plain list of catalogue pieces and their spots, each valid by the home editor\'s rules.',
    params: { layout: 'the list: catalogue id, room, x, z (plan space), quarter turns' },
    street: 'none (inside; each piece its own model)',
    build: () => buildFurnitureLayout(),
  },
];
/**
 * The plan's 3D form: the villa's interior shell on its three levels (src/economy/homeInterior.ts from VILLA_PLAN), its origin at the house's plan
 * origin. `only`: the levels shown (the others hidden, their ceilings too), for a cutaway.
 */
export function buildPlanShell(only?: readonly string[]): THREE.Group {
  const h = buildHomeInterior(homeSpec(VILLA_ID)!, 0, 0, 'almadies'), g = h.int.group;
  if (only) {
    for (const c of h.ceiling) c.visible = false;
    g.traverse(o => { const m = /^level:([a-z]+):/.exec(o.name); if (m && !only.includes(m[1])) o.visible = false; });
  }
  g.name = 'plan';
  return g;
}
/** The furniture layout set out in the house (the game's own models at their spots, on their levels; `only`: the levels set out). */
export function buildFurnitureLayout(only?: readonly string[]): THREE.Group {
  installFurnitureKit();
  const g = new THREE.Group(); g.name = 'furniture';
  for (const p of VILLA_ALMADIES_LAYOUT) {
    const f = furnitureSpec(p.spec); if (!f) continue;
    const w = toWorld(VILLA_PLAN, p.x, p.z);
    if (only && !only.includes(w.level.id)) continue;
    const m = furnitureModel(f); m.name = `${p.room}:${p.spec}`;
    m.position.set(w.x, w.y, w.z); m.rotation.y = (p.rot * Math.PI) / 2;
    g.add(m);
  }
  return g;
}
/** The flagship's id, its plan and its furniture layout (the kit's data pieces). */
export const ALMADIES_VILLA_DATA = { id: VILLA_ID, plan: VILLA_PLAN, layout: VILLA_ALMADIES_LAYOUT } as const;

/** The whole villa on its own (the plan's origin at the lot's centre, facing south), for the kit's viewer and its GLB file. */
export function buildAlmadiesVillaSolo(spec: Partial<AlmadiesVillaSpec> = {}, lite = false): THREE.Group {
  const s = soloDraw(spec, lite), o = s.options;
  const v = buildVillaCompound(s.kit, { frame: o.frame, size: o.size, palette: o.palette, pool: o.pool, number: o.number, house: o.house });
  const g = s.meshes('villa');
  g.add(v.group);
  g.userData.pools = s.pools; g.userData.ground = GROUND;
  return g;
}
export { COMPOUND_PALETTE };
