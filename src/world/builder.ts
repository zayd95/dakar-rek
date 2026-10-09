import * as THREE from 'three';
import type { HubId } from '../core/types';
import { rng, pick } from '../core/rng';
import { Batch, facadeTextures, signTexture } from './batch';
import { ACTIONS, ENTER } from './content';
import type { Collider, HubWorld, Interactable, RoadEdge } from './types';
import { makeCarRapide } from '../actors/vehicles';
import { addGrain } from './grain';
import { generatedTexture } from './textures';
import { inGate, tierRadius, tierTop, TIERS, TIER_DEPTH, PARAPET_R, PARAPET_H, WALL_R, WALL_H, ROOF_FRONT_R, ROOF_BACK_R, ROOF_FRONT_Y, ROOF_BACK_Y, roofY } from './geew';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BAY, CITY_BLOCKS, buildCityBlock } from './city';
import { isComposed, type Site } from './sites';

export const PITCH = 60, BLK = 46, ROAD = 14, NB = 4;
export const HALF = (NB * PITCH + ROAD) / 2;
const LS = (BLK - 2) / 2; // lot size
const roadC = (k: number) => -HALF + ROAD / 2 + k * PITCH;
const blockMin = (i: number) => -HALF + ROAD + i * PITCH;

type Special = 'mosque' | 'market' | 'station' | 'monument' | 'gym' | 'pitch' | 'port' | 'arena' | 'ecurie' | 'plaza';
type KioskKind = 'gargote' | 'restaurant' | 'cafe' | 'garage' | 'home' | 'dibiterie' | 'maiga';
interface KioskSpec { i: number; j: number; lot: 0 | 1 | 2 | 3; kind: KioskKind; name: string }
type Style = 'dense' | 'villa' | 'student' | 'banlieue';
interface HubSpec {
  id: HubId; seed: number; style: Style; ground: number; road: number; walk: number; blockGround: number;
  palette: number[]; floors: [number, number]; sea?: 'west' | 'north'; palms: number;
  specials: Record<string, Special>; kiosks: KioskSpec[]; spawnBlock: [number, number];
}

const SPECS: Record<HubId, HubSpec> = {
  plateau: {
    id: 'plateau', seed: 11, style: 'dense', ground: 0xcdbf9f, road: 0x4b4e54, walk: 0xc2baa8, blockGround: 0xada594,
    palette: [0xf1e6d2, 0xe8d8b8, 0xdcd0c0, 0xf4efe6, 0xc7d5df, 0xe3c9a6, 0xd9a47c], floors: [3, 7], palms: 6,
    specials: { '1,1': 'mosque', '2,1': 'market', '2,2': 'station' },
    kiosks: [{ i: 1, j: 2, lot: 3, kind: 'gargote', name: 'Gargote Chez Fatou' }, { i: 1, j: 2, lot: 2, kind: 'dibiterie', name: 'Dibiterie de la Médina' }, { i: 3, j: 2, lot: 0, kind: 'cafe', name: 'Café Touba · Sandaga' }],
    spawnBlock: [2, 2],
  },
  corniche: {
    id: 'corniche', seed: 23, style: 'student', ground: 0xd8c690, road: 0x4d5056, walk: 0xcfc8b4, blockGround: 0xb7c7a2,
    palette: [0xf0e0c4, 0xdfe6e8, 0xe9cfae, 0xcfe0d6, 0xf3d9b8], floors: [2, 4], sea: 'west', palms: 22,
    specials: { '0,1': 'gym', '0,2': 'pitch', '1,0': 'monument', '2,2': 'station' },
    kiosks: [{ i: 1, j: 2, lot: 0, kind: 'cafe', name: 'Café Touba · Fann' }, { i: 2, j: 1, lot: 2, kind: 'gargote', name: 'Gargote des étudiants' }, { i: 2, j: 1, lot: 3, kind: 'maiga', name: 'Maïga de Fann' }],
    spawnBlock: [2, 2],
  },
  almadies: {
    id: 'almadies', seed: 37, style: 'villa', ground: 0xe3d3a3, road: 0x50535a, walk: 0xe0dccc, blockGround: 0xd9ceb0,
    palette: [0xfafafa, 0xf3f0ea, 0xeeeeee, 0xf7efe2], floors: [2, 3], sea: 'north', palms: 30,
    specials: { '2,0': 'port', '1,2': 'station' },
    kiosks: [{ i: 0, j: 1, lot: 0, kind: 'restaurant', name: 'Restaurant Le Pointe' }, { i: 3, j: 1, lot: 1, kind: 'cafe', name: 'Café Touba · Ngor' }],
    spawnBlock: [1, 2],
  },
  pikine: {
    id: 'pikine', seed: 53, style: 'banlieue', ground: 0xd9b98a, road: 0xb79f78, walk: 0xcdb48a, blockGround: 0xc9a977,
    palette: [0x5fa8c9, 0x8fcf9a, 0xe7b45a, 0xe58aa0, 0xd9d2c4, 0x9c8fd1, 0xd96f4f, 0x7fb8a4], floors: [1, 2], palms: 5,
    specials: { '2,1': 'arena', '2,0': 'ecurie', '1,2': 'station' },
    kiosks: [
      { i: 1, j: 1, lot: 0, kind: 'home', name: 'Ma chambre' }, { i: 1, j: 1, lot: 1, kind: 'dibiterie', name: 'Dibiterie Chez Pathé' }, { i: 3, j: 2, lot: 2, kind: 'gargote', name: 'Gargote Mame Diarra' },
      { i: 0, j: 2, lot: 1, kind: 'cafe', name: 'Café Touba · Parcelles' }, { i: 3, j: 1, lot: 3, kind: 'garage', name: 'Garage Modou' }, { i: 3, j: 1, lot: 2, kind: 'maiga', name: 'Maïga du marché' },
    ],
    spawnBlock: [1, 1],
  },
};

export const HUB_SPAWN_NOTE = 'spawn is on the sidewalk next to the station (or the home in Pikine)';

function disposeGroup(g: THREE.Object3D) {
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.userData.shared) return;              // shared vehicle geometry/material stays alive across hubs
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    const drop = (x: THREE.Material) => { if (!x.userData.shared) x.dispose(); };
    if (Array.isArray(mat)) mat.forEach(drop); else if (mat) drop(mat);
  });
}

/** Top of sidewalks and block ground: characters stand at y 0.1, so walkable slabs stay this low. */
const G = 0.12;
const SIDEWALK = 2; // m of sidewalk between the carriageway and the block edge

const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/** Cylinder from point A to point B (radii r0 at A, r1 at B): limbs and leaning members built from primitives. */
function limb(b: Batch, A: [number, number, number], Bp: [number, number, number], r0: number, r1: number, col: number, seg = 7) {
  const dx = Bp[0] - A[0], dy = Bp[1] - A[1], dz = Bp[2] - A[2], len = Math.hypot(dx, dy, dz);
  const theta = Math.acos(THREE.MathUtils.clamp(dy / len, -1, 1)), phi = Math.atan2(dz, dx);
  b.cyl(r1, r0, len, A[0], A[1], A[2], col, seg, [0, -phi, -theta]);
}

/** Soft radial light pool texture for street lamps at night. */
let poolTex: THREE.Texture | null = null;
function lightPoolTexture() {
  if (poolTex) return poolTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  poolTex = new THREE.CanvasTexture(cv); poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}

/** lite: Low quality — skips purely decorative props (roof clutter, AC units, laundry, zebra crossings, flowers). */
export function buildHub(id: HubId, lite = false): HubWorld {
  const sp = SPECS[id];
  const R = rng(sp.seed);
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const plain = new Batch(), fac = new Batch(), lampPosts = new Batch(), lampBulbs = new Batch();
  const glass = new Batch(), water = new Batch(), leaves = new Batch();
  const pave = new Batch(), blocks = new Batch();   // world-space textured: paving slabs, raw breeze blocks
  const pools: THREE.BufferGeometry[] = [];
  const pool = (x: number, z: number, r: number, y = 0.16) => {
    const g = new THREE.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2); g.translate(x, y, z); pools.push(g);
  };

  const tex = facadeTextures();
  const facadeMat = addGrain(new THREE.MeshLambertMaterial({ map: tex.map, vertexColors: true, emissive: 0xffc070, emissiveMap: tex.glow, emissiveIntensity: 0 }), 0.7, 1, true) as THREE.MeshLambertMaterial;
  const plainMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 1, 1);
  // concrete paving: Higgsfield texture #21 (paving v2, regular 4 × 4 slabs of 50 cm per 2 m repeat)
  const paveMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5, 1, false, generatedTexture('paving'), 2);
  // raw breeze-block walls: Higgsfield texture #50 (2:1 hollow cement blocks), 3 blocks × 6 courses per repeat = 1.2 m (40 × 20 cm)
  // relief (last argument, metres) only where it reads and covers little of the screen: walls, roofs, tin, trunks, the
  // ring; not on the ground, paving, asphalt or tiers, which fill most of the frame for little visible gain
  const blockMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.4, 1, false, generatedTexture('hollow_block'), 1.2, 0.02);
  // painted metal gates and shutters: Higgsfield texture #16 (desaturated), 1 m per repeat
  const metalMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.3, 1, false, generatedTexture('painted_metal'), 1.2);
  const metal = new Batch();
  // Higgsfield batch 3 textures (8 Oct; prompts, ids and seam checks in assets-src/references/PROVENANCE.md)
  const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  const asphalt = new Batch(), asphaltMat = addGrain(lam(), 0.5, 1, false, generatedTexture('asphalt'), 3);              // #27, 3 m
  const tileRoof = new Batch(), tileRoofMat = addGrain(lam(), 0.4, 1, false, generatedTexture('clay_tiles'), 1.8, 0.04);       // #29, 6 rows of 30 cm
  const tin = new Batch(), tinMat = addGrain(lam(), 0.3, 1, false, generatedTexture('corrugated_rusty'), 1.2, 0.015);           // #26, rusty sheet
  const trunks = new Batch(), trunkMat = addGrain(lam(), 0.4, 1, false, generatedTexture('palm_trunk'), 1, 0.006);              // #49, palm bark
  const concrete = new Batch(), concreteMat = addGrain(lam(), 0.5, 1, false, generatedTexture('concrete'), 2);           // #11, arena tiers
  const ringSand = new Batch(), ringSandMat = addGrain(lam(), 0.6, 1, false, generatedTexture('sand_trampled'), 2.5, 0.04);   // #31, arena floor
  const terrazzo = new Batch(), terrazzoMat = addGrain(lam(), 0.2, 1, false, generatedTexture('terrazzo'), 1.5);         // #28, bank and mall floors
  // arena roof sheets: #25 mapped on each panel's own UVs so the corrugations run down the slope (about 11 cm pitch);
  // Low quality keeps the plain colour like every other detail texture
  const roofSheet = new Batch();
  const roofSheetMat = lite ? plainMat : addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, map: generatedTexture('corrugated', [4, 5]), bumpMap: generatedTexture('corrugated', [4, 5]), bumpScale: 2 }), 0.3, 1);
  const leafMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0.8, 2.5);
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x335577, emissiveIntensity: 0.25 });
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });

  const size = HALF * 2;
  const banlieue = sp.style === 'banlieue';
  // Ground, with the sea or beach on open sides.
  // ground: grain plus the Higgsfield sand texture #13 (3 m per repeat)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), addGrain(new THREE.MeshLambertMaterial({ color: sp.ground }), 1.2, 0.5, false, generatedTexture('sand'), 3));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; group.add(ground);

  const bounds = { x0: -HALF - 3, x1: HALF + 3, z0: -HALF - 3, z1: HALF + 3 };
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x1f7fae, emissive: 0x0b3a55, emissiveIntensity: 0.35 });
  if (sp.sea === 'west') {
    const wallC = (x0: number, z0: number, x1: number, z1: number, h: number) => colliders.push({ x0, z0, x1, z1, h });
    // Corniche Ouest (after Habib's reference photos): dual carriageway with a concrete median, sidewalk with
    // whitewashed palms, then a red-paved promenade under yellow tubular railings and arches, grass, beach, ocean.
    const CX = roadC(0), PX = -HALF - 4.6;                                          // road centre, promenade centre
    plain.box(22, 0.05, size + 40, -HALF + 1, 0, 0, 0xd8c690);                     // ground under road and promenade (below the road top)
    plain.box(30, 0.04, size + 60, -HALF - 22, 0, 0, 0xe2d2a0);                    // wet sand
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 1400), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(-HALF - 380, 0.05, 0); group.add(sea);
    plain.box(4, 0.06, size + 60, -HALF - 36, 0.02, 0, 0xf4f1e6);                  // surf line
    pave.box(2.4, G, size + 12, -HALF - 1.2, 0, 0, 0xd8d2c4);                      // sea-side sidewalk
    plain.box(3.6, G + 0.01, size + 12, PX, 0, 0, 0xb5563a);                       // red promenade path
    plain.box(2.2, G, size + 12, PX - 2.9, 0, 0, 0x6f9a4a);                        // grass verge
    plain.box(1.2, G - 0.02, size + 12, -HALF - 3.0, 0, 0, 0x7aa556);
    const YEL = 0xf2b21b;
    for (const rx of [PX + 1.95, PX - 1.95]) {
      if (rx > PX) plain.box(0.09, 0.09, size + 12, rx, 1.05, 0, YEL);
      else for (const [z0, z1] of [[-HALF - 6, BAY.z0], [BAY.z1, HALF + 6]]) {
        plain.box(0.09, 0.09, z1 - z0, rx, 1.05, (z0 + z1) / 2, YEL);
        wallC(rx - 0.13, z0, rx + 0.13, z1, 1.1);
      }
    }
    for (let z = -HALF - 4; z <= HALF + 4; z += 2.5) for (const rx of [PX + 1.95, PX - 1.95]) {
      if (rx < PX && z > BAY.z0 && z < BAY.z1) continue;
      plain.box(0.08, 1.05, 0.08, rx, G, z, YEL);
    }
    for (let z = -HALF; z <= HALF; z += 7.5) {                                     // arches over the path
      limb(plain, [PX - 1.95, 1.0, z], [PX - 0.9, 2.9, z + 0.4], 0.06, 0.06, YEL, 5);
      limb(plain, [PX - 0.9, 2.9, z + 0.4], [PX + 0.9, 2.9, z + 0.4], 0.06, 0.06, YEL, 5);
      limb(plain, [PX + 0.9, 2.9, z + 0.4], [PX + 1.95, 1.0, z], 0.06, 0.06, YEL, 5);
    }
    // road-side railing blocks the player except at each street end
    for (let k = 0; k < NB; k++) wallC(PX + 1.8, roadC(k) + 3, PX + 2.1, roadC(k + 1) - 3, 1.1);
    wallC(PX + 1.8, -HALF - 30, PX + 2.1, roadC(0) - 3, 1.1); wallC(PX + 1.8, roadC(NB) + 3, PX + 2.1, HALF + 30, 1.1);
    bounds.x0 = BAY.shoreX;
    // concrete median with gaps at the crossings; tall orange double-arm lamps on it
    for (let k = 0; k < NB; k++) {
      const z0 = roadC(k) + ROAD / 2 + 1, z1 = roadC(k + 1) - ROAD / 2 - 1;
      plain.box(0.7, 0.75, z1 - z0, CX, 0.05, (z0 + z1) / 2, 0xd8d2c4);
      wallC(CX - 0.35, z0, CX + 0.35, z1, 0.8);
      for (let z = z0 + 6; z < z1 - 3; z += 14) {
        lampPosts.cyl(0.1, 0.16, 9, CX, 0.8, z, 0xe08a1e, 6);
        for (const sx of [-1, 1]) {
          limb(lampPosts, [CX, 9.5, z], [CX + sx * 1.6, 9.9, z], 0.06, 0.06, 0xe08a1e, 5);
          lampPosts.box(0.9, 0.22, 0.5, CX + sx * 1.9, 9.7, z, 0xe08a1e);
          lampBulbs.box(0.75, 0.06, 0.38, CX + sx * 1.9, 9.62, z, 0xffe2a0);
          pool(CX + sx * 1.9, z, 7);
        }
      }
    }
  }
  if (sp.sea === 'north') {
    plain.box(size + 40, 0.1, 40, 0, 0, -HALF - 16, 0xe9d9a8);                       // beach
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.05, -HALF - 36 - 350); group.add(sea);
    plain.box(size + 60, 0.06, 4, 0, 0.02, -HALF - 37, 0xf4f1e6);                   // surf line
    bounds.z0 = -HALF - 30;
  }

  // Roads, sidewalks, block slabs.
  const edges: RoadEdge[] = [];
  const nodes: { x: number; z: number }[][] = [];
  for (let k = 0; k <= NB; k++) {
    const road = banlieue ? plain : asphalt;                         // Pikine's roads stay sandy
    road.box(ROAD, 0.08, size + 12, roadC(k), 0, 0, sp.road);       // roads along z (x = roadC(k))
    road.box(size + 12, 0.08, ROAD, 0, 0, roadC(k), sp.road);       // roads along x
  }
  for (let a = 0; a <= NB; a++) { nodes[a] = []; for (let b = 0; b <= NB; b++) nodes[a][b] = { x: roadC(a), z: roadC(b) }; }
  for (let a = 0; a <= NB; a++) for (let b = 0; b <= NB; b++) {
    if (a < NB) edges.push({ ax: roadC(a), az: roadC(b), bx: roadC(a + 1), bz: roadC(b) });
    if (b < NB) edges.push({ ax: roadC(a), az: roadC(b), bx: roadC(a), bz: roadC(b + 1) });
  }
  for (let k = 0; k <= NB; k++) {
    for (let k2 = 0; k2 < NB; k2++) {
      // centre dashes between intersections only
      const t0 = roadC(k2) + ROAD / 2 + 2, t1 = roadC(k2 + 1) - ROAD / 2 - 2;
      for (let t = t0; t < t1 - 2; t += 7) {
        plain.flat(0.22, 3, roadC(k), 0.085, t + 1.5, banlieue ? 0xd8c8a8 : 0xe8e4d8);
        plain.flat(3, 0.22, t + 1.5, 0.085, roadC(k), banlieue ? 0xd8c8a8 : 0xe8e4d8);
      }
    }
  }
  if (!banlieue && !lite) {
    // zebra crossings on every side of every intersection
    for (let a = 0; a <= NB; a++) for (let b = 0; b <= NB; b++) {
      const x = roadC(a), z = roadC(b);
      for (let s = -3; s <= 3; s++) {
        const o = s * 1.1;
        for (const side of [-1, 1]) {
          plain.flat(0.55, 2.4, x + o, 0.085, z + side * (ROAD / 2 + 1.4), 0xeeeae0);
          plain.flat(2.4, 0.55, x + side * (ROAD / 2 + 1.4), 0.085, z + o, 0xeeeae0);
        }
      }
    }
  }
  const curbCol = banlieue ? 0xb89d74 : 0xb9b3a6;
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const bx = blockMin(i), bz = blockMin(j), cx = bx + BLK / 2, cz = bz + BLK / 2, W = BLK + SIDEWALK * 2;
    (banlieue ? plain : pave).box(W, G - 0.01, W, cx, 0, cz, sp.walk);
    // curb stones
    plain.box(W + 0.3, G + 0.02, 0.3, cx, 0, cz - W / 2, curbCol); plain.box(W + 0.3, G + 0.02, 0.3, cx, 0, cz + W / 2, curbCol);
    plain.box(0.3, G + 0.02, W, cx - W / 2, 0, cz, curbCol); plain.box(0.3, G + 0.02, W, cx + W / 2, 0, cz, curbCol);
    (sp.style === 'dense' ? pave : plain).box(BLK, G + 0.01, BLK, cx, 0, cz, sp.blockGround);
    if (banlieue) for (let n = 0; n < 5; n++) plain.blob(1.5 + R() * 2, bx - SIDEWALK + R() * (BLK + 4), G - 0.06, bz + (R() < 0.5 ? -1 : BLK + 1), 0xcfb88e, 0.05, 1); // drifted sand
  }

  const lotRect = (i: number, j: number, a: number, b: number) => {
    const x0 = blockMin(i) + a * (LS + 2), z0 = blockMin(j) + b * (LS + 2);
    return { x0, z0, x1: x0 + LS, z1: z0 + LS, cx: x0 + LS / 2, cz: z0 + LS / 2 };
  };
  const solid = (x0: number, z0: number, x1: number, z1: number, h: number) => colliders.push({ x0, z0, x1, z1, h });
  const solidC = (cx: number, cz: number, w: number, d: number, h: number) => solid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h);

  const signs: THREE.Mesh[] = [];
  const rapides: THREE.Object3D[] = [];
  /** Climbable stairs: height rises linearly from y0 at x0 to y1 at x1, then stays at y1 until xEnd. */
  const ramps: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; xEnd: number }[] = [];
  const addSign = (text: string, bg: string, fg: string, x: number, y: number, z: number, rotY: number, w = 6, h = 1.5) => {
    const tex = text.length > 18 ? signTexture(text, bg, fg, 768, 112) : signTexture(text, bg, fg);   // long names get a wider canvas so they never clip
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }));
    m.position.set(x, y, z); m.rotation.y = rotY; group.add(m); signs.push(m);
  };
  const palm = (x: number, z: number, s = 1, whitewash = false) => {
    R(); // (was lean; kept so the hub layouts stay the same)
    const h = 6.2 * s;
    for (let k = 0; k < 2; k++) trunks.cyl(0.2 * s + (1 - k) * 0.06, 0.26 * s + (1 - k) * 0.06, h / 2 + 0.05, x, 0.1 + (k * h) / 2, z, k % 2 ? 0x9a7b55 : whitewash ? 0xf1eee6 : 0x8a6d4a, 5);
    const top = 0.1 + h;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + R() * 0.5;
      const len = 3.4 * s;
      // each frond: two boxes drooping outward
      leaves.box(0.75 * s, 0.1 * s, len, x + Math.sin(a) * len * 0.45, top - 0.3 * s, z + Math.cos(a) * len * 0.45, k % 2 ? 0x2f7f3e : 0x3d9450, a);
    }
    leaves.blob(0.45 * s, x, top - 0.1, z, 0x6b5a2a, 1, 0);
  };
  /** Neem / flamboyant-style shade tree: short trunk, wide clumpy canopy. */
  const tree = (x: number, z: number, s = 1, flower = false) => {
    plain.cyl(0.22 * s, 0.32 * s, 2.6 * s, x, 0.1, z, 0x6e5a44, 6);
    plain.cyl(0.12 * s, 0.16 * s, 1.4 * s, x + 0.5 * s, 2.2 * s, z, 0x6e5a44, 5, [0, 0, -0.6]);
    const cols = flower ? [0xc8442c, 0xd9542f, 0x4a7a35] : [0x3f6e2e, 0x4c7d36, 0x365f28];
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + R(), r = k === 0 ? 0 : 1.3 * s;
      leaves.blob((1.4 + R() * 0.6) * s, x + Math.sin(a) * r, (3.3 + R() * 0.8) * s, z + Math.cos(a) * r, cols[k % 3], 0.75, 0);
    }
    solidC(x, z, 0.6, 0.6, 2.4);
  };
  const awning = (cx: number, cz: number, w: number, d: number, y: number, col: number, alongX = true, dir = 1) => {
    // striped canvas awning sloping down toward the street
    const n = Math.max(3, Math.round(w / 1.1));
    for (let k = 0; k < n; k++) {
      const off = -w / 2 + (k + 0.5) * (w / n);
      const c = k % 2 ? col : 0xf3eee2;
      if (alongX) plain.box(w / n + 0.01, 0.08, d, cx + off, y - 0.25, cz, c, 0); else plain.box(d, 0.08, w / n + 0.01, cx, y - 0.25, cz + off, c);
    }
    if (alongX) plain.box(w, 0.35, 0.06, cx, y - 0.6, cz + dir * d / 2, col); else plain.box(0.06, 0.35, w, cx + dir * d / 2, y - 0.6, cz, col);
  };
  /** Rolling metal shutter of a ground-floor boutique, with a painted board above it. */
  const SHOP_BOARDS = [0xd9482b, 0xf4c20d, 0x1e6fd9, 0x2f8f4e, 0xe8742c, 0x6b3fa0];
  const shopfront = (x: number, z: number, nx: number, nz: number) => {
    const rot = Math.atan2(nx, nz);
    metal.box(2.6, 2.4, 0.08, x, G, z, R() < 0.5 ? 0x8a9096 : 0x6f8aa0, rot);
    for (let k = 0; k < 3; k++) plain.box(2.6, 0.04, 0.1, x, G + 0.5 + k * 0.6, z, 0x5c6266, rot);
    plain.box(3.0, 0.6, 0.1, x + nx * 0.03, G + 2.6, z + nz * 0.03, pick(SHOP_BOARDS, R), rot);
  };
  /** Split air-conditioner box on a wall (nx, nz = outward normal). */
  const acUnit = (x: number, y: number, z: number, nx: number, nz: number) => {
    if (lite) return;
    plain.box(0.9, 0.55, 0.32, x + nx * 0.16, y, z + nz * 0.16, 0xe8e6e0, Math.atan2(nx, nz));
  };
  /** Low parapet around a flat roof. */
  const parapet = (cx: number, cz: number, w: number, d: number, y: number, col: number, hgt = 0.7) => {
    plain.box(w, hgt, 0.22, cx, y, cz - d / 2 + 0.11, col); plain.box(w, hgt, 0.22, cx, y, cz + d / 2 - 0.11, col);
    plain.box(0.22, hgt, d, cx - w / 2 + 0.11, y, cz, col); plain.box(0.22, hgt, d, cx + w / 2 - 0.11, y, cz, col);
  };
  const roofClutter = (cx: number, cz: number, w: number, d: number, y: number) => {
    if (lite) return;
    if (R() < 0.65) { const tx = cx + (R() - 0.5) * (w - 3), tz = cz + (R() - 0.5) * (d - 3); plain.cyl(0.65, 0.65, 1.3, tx, y, tz, 0x1d1f22, 10); plain.cyl(0.25, 0.25, 0.15, tx, y + 1.3, tz, 0x2b2d30, 8); }
    if (R() < 0.5) { const tx = cx + (R() - 0.5) * (w - 2), tz = cz + (R() - 0.5) * (d - 2); plain.box(0.06, 0.9, 0.06, tx, y, tz, 0x777777); plain.cyl(0.55, 0.08, 0.22, tx, y + 0.85, tz, 0xe9e9e6, 10, [0.9, R() * 6, 0]); }
    if (R() < 0.3) { const tx = cx + (R() - 0.5) * (w - 3), tz = cz + (R() - 0.5) * (d - 3); plain.box(2.2, 2.3, 2.2, tx, y, tz, shade(0xd6cfc2, 0.95)); plain.box(0.9, 1.9, 0.05, tx, y, tz + 1.12, 0x5a6f86); } // stair head
    if (R() < 0.35) { // washing line
      const tx = cx + (R() - 0.5) * (w - 4), tz = cz + (R() - 0.5) * (d - 4);
      plain.box(0.05, 1.6, 0.05, tx - 1.6, y, tz, 0x777777); plain.box(0.05, 1.6, 0.05, tx + 1.6, y, tz, 0x777777);
      for (let k = 0; k < 4; k++) plain.box(0.5, 0.7, 0.02, tx - 1.2 + k * 0.8, y + 0.85, tz, pick([0xf2f2ec, 0xd9482b, 0x2f6fb3, 0xf4c20d, 0x1a9d54], R));
    }
  };
  /** Street-facing details for a box building: plinth, AC units, shutters. faces = outward normals that see a street. */
  const dressBuilding = (cx: number, cz: number, w: number, d: number, h: number, col: number, faces: [number, number][], shops: boolean) => {
    plain.box(w + 0.1, 0.75, d + 0.1, cx, G - 0.02, cz, shade(col, 0.68));              // dusty plinth band
    plain.box(w + 0.3, 0.18, d + 0.3, cx, G + h - 0.18, cz, shade(col, 0.88));          // cornice
    const floors = Math.round(h / 3.2);
    for (const [nx, nz] of faces) {
      const len = nx ? d : w;
      const fx = cx + nx * (w / 2), fz = cz + nz * (d / 2);
      const bays = Math.floor(len / 3.4);
      for (let f = 1; f < floors; f++) for (let b = 1; b < bays; b++) if (R() < 0.22) {
        const t = -len / 2 + b * 3.4;
        acUnit(fx + (nz ? t : 0), G + f * 3.2 + 0.4, fz + (nx ? t : 0), nx, nz);
      }
      if (shops) {
        const n = Math.max(1, Math.floor(len / 6));
        for (let k = 0; k < n; k++) if (R() < 0.7) {
          const t = -len / 2 + (k + 0.5) * (len / n);
          shopfront(fx + (nz ? t : 0) + nx * 0.05, fz + (nx ? t : 0) + nz * 0.05, nx, nz);
        }
      }
    }
  };
  /** Which sides of lot (a, b) of a block face a street: lots on the outer half face -x/+x and -z/+z. */
  const lotFaces = (a: number, b: number): [number, number][] => [[a ? 1 : -1, 0], [0, b ? 1 : -1]];

  // ------------------------------------------------------------ buildings per block
  /** Yard wall; raw = bare breeze blocks (never rendered or painted). */
  const wall = (x0: number, z0: number, x1: number, z1: number, col: number, h = 1.4, raw = false) => {
    const cap = shade(col, 1.08), base = shade(col, 0.72);
    for (const [w, d, x, z] of [[x1 - x0, 0.3, (x0 + x1) / 2, z0], [x1 - x0, 0.3, (x0 + x1) / 2, z1], [0.3, z1 - z0, x0, (z0 + z1) / 2], [0.3, z1 - z0, x1, (z0 + z1) / 2]] as const) {
      if (raw) { blocks.box(w, h, d, x, G - 0.02, z, 0xe8e2d6); continue; }
      plain.box(w, h, d, x, G - 0.02, z, col);
      if (lite) continue;
      plain.box(w + 0.05, 0.12, d + 0.12, x, G + h - 0.04, z, cap);
      plain.box(w + 0.02, 0.4, d + 0.04, x, G - 0.02, z, base);
    }
  };
  const GATES = [0x1e6fd9, 0x2f8f4e, 0xc0392b, 0x1d6f8a, 0x7a3f9a, 0xd98b1a];
  /** Painted metal gate set into a yard wall (normal nx, nz). */
  const gate = (x: number, z: number, nx: number, nz: number, h = 2.2) => {
    const rot = Math.atan2(nx, nz), col = pick(GATES, R);
    metal.box(2.6, h, 0.42, x, G - 0.02, z, col, rot);
    for (let k = 0; k < (lite ? 0 : 4); k++) plain.box(0.06, h - 0.3, 0.46, x + (nz ? -0.9 + k * 0.6 : 0), G + 0.15, z + (nx ? -0.9 + k * 0.6 : 0), shade(col, 0.7), rot);
    for (const s of [-1.45, 1.45]) plain.box(0.45, h + 0.4, 0.5, x + (nz ? s : 0), G - 0.02, z + (nx ? s : 0), 0xe9e1cf, rot);
  };

  const buildLotBuilding = (i: number, j: number, a: number, b: number) => {
    const L = lotRect(i, j, a, b);
    const faces = lotFaces(a, b);
    if (sp.style === 'banlieue') {
      // Two small breeze-block houses inside a painted yard wall with a coloured metal gate.
      for (let k = 0; k < 2; k++) {
        const w = 8 + R() * 3, d = 8 + R() * 3, fl = 1 + (R() < 0.35 ? 1 : 0);
        const cx = L.cx + (k ? 5.5 : -5.5), cz = L.cz + (R() - 0.5) * 6, h = fl * 3 + 0.3;
        const col = pick(sp.palette, R);
        fac.facade(w, h, d, cx, G - 0.02, cz, col);
        plain.box(w + 0.4, 0.25, d + 0.4, cx, G + h - 0.02, cz, 0x9a968c);            // roof slab
        parapet(cx, cz, w + 0.4, d + 0.4, G + h + 0.2, shade(col, 0.9), 0.5);
        plain.box(w + 0.1, 0.7, d + 0.1, cx, G - 0.02, cz, shade(col, 0.66));          // splash band
        if (R() < 0.6 && !lite) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plain.box(0.18, 1.0, 0.18, cx + sx * (w / 2 - 0.3), G + h + 0.2, cz + sz * (d / 2 - 0.3), 0x6b5a4a); // rebar stubs: the next floor, someday
        if (R() < 0.5) plain.cyl(0.6, 0.6, 1.2, cx + (R() - 0.5) * 3, G + h + 0.22, cz + (R() - 0.5) * 3, 0x1d1f22, 10);
        if (R() < 0.35) acUnit(cx + (R() - 0.5) * (w - 2), G + 2.2, cz + faces[1][1] * d / 2, 0, faces[1][1]);
        solidC(cx, cz, w, d, h);
      }
      const wc = pick([0xd8c7a6, 0xe6d4b0, 0xc9b99a, 0xdcc2a0, 0xb8cfc0, 0xe2b9a6], R);
      wall(L.x0 + 0.5, L.z0 + 0.5, L.x1 - 0.5, L.z1 - 0.5, wc, 2.1, R() < 0.4);
      const [fx, fz] = faces[1];
      gate(L.cx + (R() - 0.5) * 8, fz < 0 ? L.z0 + 0.5 : L.z1 - 0.5, fx, fz);
      if (R() < 0.45) shopfront(L.cx + (R() < 0.5 ? -7 : 7), fz < 0 ? L.z0 + 0.3 : L.z1 - 0.3, 0, fz);
      if (R() < 0.35) tree(L.cx + (R() - 0.5) * 4, L.cz + (R() - 0.5) * 4, 0.9, R() < 0.3);
      return;
    }
    if (sp.style === 'villa') {
      const w = 15 + R() * 3, d = 11 + R() * 2, fl = 2, h = fl * 3.2;
      const col = pick(sp.palette, R);
      fac.facade(w, h, d, L.cx, G - 0.02, L.cz + 3, col);
      plain.box(w + 0.6, 0.3, d + 0.6, L.cx, G + h - 0.02, L.cz + 3, 0xdadada);
      plain.box(w + 0.1, 0.6, d + 0.1, L.cx, G - 0.02, L.cz + 3, 0xb9b2a4);
      plain.box(w * 0.5, 0.25, 2.2, L.cx - w * 0.2, G + 3.2, L.cz + 3 - d / 2 - 1.1, 0xe8e4dc); // terrace slab
      for (let k = 0; k < 6; k++) plain.box(0.06, 0.9, 0.06, L.cx - w * 0.45 + k * (w * 0.5 / 5), G + 3.45, L.cz + 3 - d / 2 - 2.15, 0x333333);
      plain.box(w * 0.5, 0.06, 0.08, L.cx - w * 0.2, G + 4.35, L.cz + 3 - d / 2 - 2.15, 0x333333);
      glass.box(w - 2, 1.6, 0.1, L.cx, G + 1.0, L.cz + 3 - d / 2 - 0.06, 0x2f5f86);
      plain.box(8.6, 0.1, 5.1, L.cx + 3, G, L.cz - 6.5, 0xe8e4dc);                    // pool deck
      water.box(8, 0.06, 4.5, L.cx + 3, G + 0.05, L.cz - 6.5, 0x35b0de);              // pool
      wall(L.x0 + 0.3, L.z0 + 0.3, L.x1 - 0.3, L.z1 - 0.3, 0xf0ece0, 2.2);
      gate(L.cx, faces[1][1] < 0 ? L.z0 + 0.3 : L.z1 - 0.3, 0, faces[1][1], 2.4);
      // bougainvillea spilling over the wall
      for (let k = 0; k < (lite ? 0 : 4); k++) {
        const t = R(), side = R() < 0.5;
        const x = side ? L.x0 + 0.3 + t * (LS - 0.6) : (R() < 0.5 ? L.x0 + 0.3 : L.x1 - 0.3), z = side ? (R() < 0.5 ? L.z0 + 0.3 : L.z1 - 0.3) : L.z0 + 0.3 + t * (LS - 0.6);
        leaves.blob(0.9 + R() * 0.5, x, G + 2.3, z, pick([0xc2307a, 0xd94a8c, 0xa8256a, 0x3f7a35], R), 0.7, 0);
      }
      solidC(L.cx, L.cz + 3, w, d, h);
      palm(L.x0 + 2.5, L.z0 + 2.5, 0.9); palm(L.x1 - 2.5, L.z0 + 3, 0.9);
      roofClutter(L.cx, L.cz + 3, w, d, G + h + 0.28);
      return;
    }
    // Plateau (after Habib's aerial photo): a few towers among 3–7 storey blocks, some low blocks under red tile roofs
    const tower = sp.style === 'dense' && R() < 0.16;
    const tiles = sp.style === 'dense' && !tower && R() < 0.3;
    let fl = sp.floors[0] + Math.floor(R() * (sp.floors[1] - sp.floors[0] + 1));
    if (tower) fl = 11 + Math.floor(R() * 8); else if (tiles) fl = Math.min(fl, 4);
    const w = tower ? 13 + R() * 3 : 15 + R() * 5, d = tower ? 13 + R() * 3 : 15 + R() * 5, h = fl * 3.2;
    const col = tower ? pick([0xf1e6d2, 0xe8d8b8, 0xf4efe6, 0xe3c9a6, 0xd9773f], R) : pick(sp.palette, R);
    const cx = L.cx + (R() - 0.5) * 2, cz = L.cz + (R() - 0.5) * 2;
    fac.facade(w, h, d, cx, G - 0.02, cz, col);
    plain.box(w + 0.5, 0.3, d + 0.5, cx, G + h - 0.02, cz, 0xd2cdc2);
    if (tiles) {
      // hipped roof in red clay tiles (4-sided pyramid, flattened)
      const rr = Math.max(w, d) * 0.72;
      tileRoof.cyl(0.6, rr, 3.0, cx, G + h + 0.25, cz, 0xcc5d34, 4, [0, Math.PI / 4, 0]);
    } else {
      parapet(cx, cz, w + 0.5, d + 0.5, G + h + 0.26, shade(col, 0.92), 0.8);
      roofClutter(cx, cz, w, d, G + h + 0.28);
    }
    if (tower) {
      plain.box(4, 3, 4, cx, G + h + 0.28, cz, 0xb8b2a6);                               // lift machine room
      for (let a = 0; a < 3; a++) plain.cyl(0.06, 0.06, 6 + a * 2, cx - 1 + a, G + h + 3.2, cz, 0x9a9a9a, 4);   // antennas
      glass.box(w * 0.34, h - 4, 0.12, cx, G + 3.4, cz + (b ? 1 : -1) * (d / 2 + 0.07), 0x35607e);    // glazed stair core
    }
    dressBuilding(cx, cz, w, d, h, col, lotFaces(a, b), sp.style === 'student');
    if (sp.style === 'dense') {
      const fz = b ? 1 : -1;
      plain.box(w, 0.3, 3, cx, 3.4, cz + fz * (d / 2 + 1.4), 0xb9ad98);                   // ground-floor arcade slab
      for (let k = -2; k <= 2; k++) plain.box(0.5, 3.2, 0.5, cx + k * (w / 4.4), G, cz + fz * (d / 2 + 2.6), 0xe9e1cf);
      for (let k = -1; k <= 1; k++) shopfront(cx + k * (w / 3.2), cz + fz * (d / 2 + 0.05), 0, fz);
      if (fl >= 5) plain.box(4, 2, 4, cx, G + h + 0.3, cz, 0x9aa3a8);                     // roof plant
    } else {
      // student blocks: balconies with railings on the street side
      const fz = b ? 1 : -1;
      for (let f = 1; f < fl; f++) {
        const bw = w * 0.42, bxc = cx + (f % 2 ? -1 : 1) * w * 0.22, y = G + f * 3.2, z = cz + fz * (d / 2 + 0.6);
        plain.box(bw, 0.18, 1.2, bxc, y - 0.1, z, 0xd8d2c6);
        plain.box(bw, 0.06, 0.06, bxc, y + 0.95, z + fz * 0.58, 0x2d3748);
        for (let k = 0; k <= 8; k++) plain.box(0.04, 0.95, 0.04, bxc - bw / 2 + (k * bw) / 8, y, z + fz * 0.58, 0x2d3748);
        if (R() < 0.6 && !lite) plain.box(0.9, 0.6, 0.02, bxc + (R() - 0.5) * bw * 0.6, y + 0.4, z + fz * 0.62, pick([0xd9482b, 0x2f6fb3, 0xf4c20d, 0xf2f2ec], R)); // laundry
      }
    }
    solidC(cx, cz, w + 0.5, d + 0.5, h);
  };

  /**
   * Dibiterie (grilled-meat eatery), after Higgsfield reference #10 (artistic interpretation): an open-fronted room the
   * player walks into, under a corrugated tin awning; charcoal grill with skewers and smoke at the front edge, tiled
   * butcher's counter with hanging meat inside, a wooden bench, plastic tables and chairs, a bulb and a fluorescent tube,
   * walls painted blue to waist height and cream above. Names are fictional.
   */
  const dibiterie = (k: KioskSpec) => {
    const L = lotRect(k.i, k.j, k.lot % 2, k.lot >> 1);
    const south = (k.lot >> 1) === 1, dir = south ? 1 : -1;
    const w = 11, d = 7.5, h = 3.4, cx = L.cx;
    const cz = south ? L.z1 - d / 2 - 0.5 : L.z0 + d / 2 + 0.5;
    const front = cz + dir * d / 2, back = cz - dir * d / 2;
    const at = (t: number) => cz + dir * t;                                           // depth from the centre toward the street
    const WB = 0x5f8fae, WC = 0xeee2c4;
    plain.box(w, 0.06, d, cx, G - 0.02, cz, 0xb9b2a4);                                // cement floor
    for (const [bw, bx, bz, bd] of [[w, cx, back, 0.3], [0.3, cx - w / 2, cz, d], [0.3, cx + w / 2, cz, d]] as const) {
      plain.box(bw, 1.2, bd, bx, G, bz, WB); plain.box(bw, h - 1.2, bd, bx, G + 1.2, bz, WC);
    }
    plain.box(w + 0.4, 0.3, d + 0.4, cx, G + h, cz, 0xd2cdc2);                        // roof slab
    for (const sx of [-1, 1]) plain.box(0.4, h, 0.4, cx + sx * (w / 2 - 0.2), G, front, WC); // front piers
    plain.box(w, 0.5, 0.35, cx, G + h - 0.5, front, WC);                              // lintel
    // corrugated tin awning on poles over the pavement
    for (let n = 0; n < 12; n++) tin.box((w + 1) / 12 + 0.02, 0.06, 2.8, cx - (w + 1) / 2 + (n + 0.5) * ((w + 1) / 12), G + 3.0 - (n % 2) * 0.05, front + dir * 1.4, n % 2 ? 0xe2dfd8 : 0xd2cfc8);
    for (const sx of [-1, 1]) plain.box(0.08, 2.9, 0.08, cx + sx * (w / 2 + 0.3), G, front + dir * 2.7, 0x555555);
    // charcoal grill at the front edge with skewers and glowing embers
    const gx = cx - 2.5, gz = at(d / 2 - 0.6);
    plain.box(2.0, 0.8, 0.7, gx, G, gz, 0x3a3a3a); for (const sx of [-1, 1]) for (const sz of [-1, 1]) plain.box(0.06, 0.8, 0.06, gx + sx * 0.95, G, gz + sz * 0.3, 0x2a2a2a);
    lampBulbs.box(1.8, 0.04, 0.55, gx, G + 0.82, gz, 0xff7a2a);                       // embers
    for (let n = 0; n < 9; n++) { plain.box(0.03, 0.03, 0.7, gx - 0.8 + n * 0.2, G + 0.9, gz, 0xb0b0b0); plain.box(0.1, 0.07, 0.4, gx - 0.8 + n * 0.2, G + 0.92, gz, 0x7a3a1e); }
    solidC(gx, gz, 2.0, 0.8, 1);
    // butcher's counter (white tiles) with meat hanging from a rail
    const kz = at(-d / 2 + 1.4);
    plain.box(4.5, 1.05, 0.9, cx + 2.4, G, kz, 0xf2f0ea); plain.box(4.6, 0.06, 1.0, cx + 2.4, G + 1.05, kz, 0xd8d4cc);
    plain.box(4.6, 0.04, 0.04, cx + 2.4, G + 2.4, kz - dir * 0.6, 0x9a9a9a);
    for (let n = 0; n < 5; n++) { plain.box(0.02, 0.25, 0.02, cx + 0.6 + n * 0.8, G + 2.15, kz - dir * 0.6, 0x9a9a9a); plain.blob(0.22, cx + 0.6 + n * 0.8, G + 1.85, kz - dir * 0.6, n % 2 ? 0x9c3a2e : 0xb24b3a, 1.6, 0); }
    solidC(cx + 2.4, kz, 4.6, 1.2, 1.1);
    // bench along the side wall, plastic tables and chairs in the room
    plain.box(0.5, 0.45, 3.4, cx - w / 2 + 0.6, G, cz, 0x7a5a3c); plain.box(0.1, 0.9, 3.4, cx - w / 2 + 0.3, G + 0.45, cz, 0x6b4a2e);
    solidC(cx - w / 2 + 0.6, cz, 0.6, 3.4, 0.5);
    for (const [tx, tz, col] of [[cx - 1.2, at(-0.3), 0xf2f2ee], [cx + 1.4, at(1.5), 0x2a8fd1]] as const) {
      plain.box(0.06, 0.72, 0.06, tx, G, tz, 0x666666); plain.box(1.1, 0.04, 0.75, tx, G + 0.72, tz, col);
      for (const sx of [-1, 1]) { plain.box(0.45, 0.04, 0.45, tx + sx * 0.8, G + 0.45, tz, sx > 0 ? 0x1a9d54 : col); plain.box(0.45, 0.45, 0.04, tx + sx * 1.0, G + 0.45, tz, sx > 0 ? 0x1a9d54 : col); for (const dz of [-0.18, 0.18]) plain.box(0.04, 0.45, 0.04, tx + sx * 0.8, G, tz + dz, 0xdddddd); }
      solidC(tx, tz, 1.2, 0.8, 0.8);
      plain.cyl(0.12, 0.12, 0.03, tx - 0.2, G + 0.76, tz, 0xf4f1e8, 10); plain.box(0.2, 0.05, 0.12, tx + 0.2, G + 0.78, tz, 0x7a3a1e);
    }
    // lights: fluorescent tube and a bare bulb
    plain.box(1.3, 0.06, 0.12, cx, G + h - 0.12, at(-1), 0xdddddd); lampBulbs.box(1.2, 0.05, 0.06, cx, G + h - 0.17, at(-1), 0xeaf6ff);
    plain.cyl(0.01, 0.01, 0.3, gx, G + h - 0.3, gz - dir * 0.8, 0x222222, 4); lampBulbs.sphere(0.07, gx, G + h - 0.36, gz - dir * 0.8, 0xfff1c8);
    // walls collide (front stays open)
    solid(cx - w / 2 - 0.3, Math.min(back, front), cx - w / 2 + 0.15, Math.max(back, front), h);
    solid(cx + w / 2 - 0.15, Math.min(back, front), cx + w / 2 + 0.3, Math.max(back, front), h);
    solidC(cx, back, w, 0.4, h);
    addSign(k.name.toUpperCase(), '#7c2d12', '#fff7e0', cx, G + h - 0.25, front + dir * 0.2, dir > 0 ? 0 : Math.PI, 6.8, 0.75);
    smokeAt.push({ x: gx, y: G + 1.0, z: gz });
    pool(cx, at(-0.6), 5, G + 0.07); pool(gx, gz + dir * 1.2, 3.2, G + 0.07);          // light spilling at night
    const face = dir > 0 ? 0 : Math.PI;                                               // facing the street
    people.push({ x: gx, z: gz - dir * 0.75, yaw: face, clip: 'Talk' });            // the cook at the grill
    people.push({ x: cx - 1.2 - 0.85, z: at(-0.3), yaw: Math.PI / 2, clip: 'Sit', y: -0.05 });
    people.push({ x: cx + 1.4 + 0.85, z: at(1.5), yaw: -Math.PI / 2, clip: 'Sit', y: -0.05 });
    people.push({ x: cx + 2.4, z: kz - dir * 0.75, yaw: face, clip: 'Idle' });     // the butcher behind the counter
    interactables.push({ id: `${id}:dibiterie:${k.i}${k.j}`, name: k.name, kind: 'actions', x: cx, z: at(0.6), radius: 3.6, actions: ACTIONS.dibiterie });
  };
  const smokeAt: { x: number; y: number; z: number }[] = [];
  const people: HubWorld['people'] = [];
  const seats: HubWorld['seats'] = [];
  /** Sites left to the venues module (src/world/sites.ts): ground only, plus the place's identity interactable. */
  const sites: Site[] = [];
  /**
   * Footprint the replaced building had, kept as colliders only while the streets are dressed: random trees, palms and
   * stalls test them, so the rest of the hub keeps exactly the same layout. Removed before the hub is returned.
   */
  const ghosts: Collider[] = [];
  const ghost = (x0: number, z0: number, x1: number, z1: number, h: number) => { const c = { x0, z0, x1, z1, h }; ghosts.push(c); colliders.push(c); };
  const inSite = (x: number, z: number) => sites.some(s => x > s.x0 - 0.3 && x < s.x1 + 0.3 && z > s.z0 - 0.3 && z < s.z1 + 0.3);
  /**
   * Street dressing that would fall inside a composed site is not drawn, but it draws its random numbers and keeps its
   * collider as a ghost exactly as before, so every later tree, palm and stall of the hub stays where it was.
   */
  const dress = (x: number, z: number, place: () => void) => {
    if (!inSite(x, z)) { place(); return; }
    const marks = [plain, leaves, trunks].map(b => b.mark()), n = colliders.length;
    place();
    [plain, leaves, trunks].forEach((b, i) => b.rollback(marks[i]));
    for (const c of colliders.splice(n)) ghost(c.x0, c.z0, c.x1, c.z1, c.h);
  };
  const composedLot = (k: KioskSpec) => {
    const a = k.lot % 2, b = k.lot >> 1, L = lotRect(k.i, k.j, a, b), dir = b ? 1 : -1;
    const key = `${k.kind}:${k.i}${k.j}`, itId = `${id}:${key}`;
    sites.push({ key, kind: 'dibiterie', name: k.name, x0: L.x0, z0: L.z0, x1: L.x1, z1: L.z1, front: { x: 0, z: dir }, side: { x: a ? 1 : -1, z: 0 }, interactable: itId });
    interactables.push({ id: itId, name: k.name, kind: 'actions', x: L.cx, z: dir > 0 ? L.z1 : L.z0, radius: 3, actions: [] });
    // the old dibiterie's colliders (same numbers as dibiterie() above)
    const w = 11, d = 7.5, h = 3.4, cx = L.cx, cz = dir > 0 ? L.z1 - d / 2 - 0.5 : L.z0 + d / 2 + 0.5;
    const at = (t: number) => cz + dir * t, front = cz + dir * d / 2, back = cz - dir * d / 2;
    const g = (x: number, z: number, gw: number, gd: number, gh: number) => ghost(x - gw / 2, z - gd / 2, x + gw / 2, z + gd / 2, gh);
    g(cx - 2.5, at(d / 2 - 0.6), 2.0, 0.8, 1); g(cx + 2.4, at(-d / 2 + 1.4), 4.6, 1.2, 1.1); g(cx - w / 2 + 0.6, cz, 0.6, 3.4, 0.5);
    g(cx - 1.2, at(-0.3), 1.2, 0.8, 0.8); g(cx + 1.4, at(1.5), 1.2, 0.8, 0.8);
    ghost(cx - w / 2 - 0.3, Math.min(back, front), cx - w / 2 + 0.15, Math.max(back, front), h);
    ghost(cx + w / 2 - 0.15, Math.min(back, front), cx + w / 2 + 0.3, Math.max(back, front), h);
    g(cx, back, w, 0.4, h);
  };

  const kioskAt = (k: KioskSpec) => {
    const L = lotRect(k.i, k.j, k.lot % 2, k.lot >> 1);
    const south = (k.lot >> 1) === 1;       // lot row b: 0 -> faces -z, 1 -> faces +z
    const dir = south ? 1 : -1;
    const small = k.kind === 'maiga';
    const w = small ? 7 : 14, d = small ? 6 : 8, h = small ? 3.6 : 4.2;
    const cz = south ? L.z1 - d / 2 - 0.5 : L.z0 + d / 2 + 0.5, cx = L.cx;
    const col = k.kind === 'cafe' ? 0x6fa56a : k.kind === 'gargote' ? 0xe8a43c : k.kind === 'restaurant' ? 0xf3f0ea : k.kind === 'garage' ? 0x7f8a96 : k.kind === 'maiga' ? 0x6f9e98 : 0xe7b45a;
    fac.facade(w, h, d, cx, G - 0.02, cz, col);
    plain.box(w + 0.4, 0.3, d + 0.4, cx, G + h - 0.02, cz, 0xd2cdc2);
    parapet(cx, cz, w + 0.4, d + 0.4, G + h + 0.26, shade(col, 0.9), 0.6);
    plain.box(w + 0.1, 0.7, d + 0.1, cx, G - 0.02, cz, shade(col, 0.66));
    if (!small) {
    awning(cx, cz + dir * (d / 2 + 1.2), w - 1, 2.4, 3.0, k.kind === 'cafe' ? 0x2f8f4e : k.kind === 'garage' ? 0x2d3748 : 0xd9482b, true, dir);
    plain.box(w - 3, 1, 0.8, cx, G, cz + dir * (d / 2 + 0.6), 0x7a5a3c);              // counter
    plain.box(w - 2.6, 0.08, 1.0, cx, G + 1, cz + dir * (d / 2 + 0.6), 0x5a3f2a);
    } else {
      // Maïga front: a bare doorway with a plastic strip curtain, soot above it, one bench outside
      plain.box(1.3, 2.3, 0.05, cx - 1.5, G, cz + dir * (d / 2 + 0.03), 0x1e1e1e);
      for (let n = 0; n < 6; n++) plain.box(0.18, 2.1, 0.02, cx - 2.05 + n * 0.22, G + 0.15, cz + dir * (d / 2 + 0.07), [0xd9322b, 0xf4c20d, 0x2a8fd1][n % 3]);
      plain.box(2.2, 1.0, 0.03, cx - 1.5, G + 2.4, cz + dir * (d / 2 + 0.04), 0x4a4842);
      plain.box(1.6, 0.45, 0.4, cx + 1.6, G, cz + dir * (d / 2 + 0.9), 0x6b4a2e);
    }
    if (k.kind === 'gargote' || k.kind === 'cafe' || k.kind === 'restaurant') {
      for (let n = 0; n < 3; n++) {                                                   // benches and a low table out front
        const bx = cx - 4 + n * 4, bz = cz + dir * (d / 2 + 3.2);
        plain.box(1.6, 0.45, 0.4, bx, G, bz, 0x6b4a2e); plain.box(1.0, 0.05, 1.0, bx, G + 0.6, bz + dir * 0.8, 0x8b6a47); plain.box(0.1, 0.6, 0.1, bx, G, bz + dir * 0.8, 0x5a3f2a);
      }
    }
    if (k.kind === 'garage') for (let n = 0; n < 4; n++) plain.cyl(0.38, 0.38, 0.28, cx + 5 + (n % 2) * 0.2, G + n * 0.28, cz + dir * (d / 2 + 2.4), 0x1d1d1f, 10); // tyre stack
    solidC(cx, cz, w, d + (small ? 0.2 : 1.4), h);
    const bg = k.kind === 'maiga' ? '#3f4f4a' : k.kind === 'cafe' ? '#14532d' : k.kind === 'gargote' ? '#7c2d12' : k.kind === 'restaurant' ? '#0c4a6e' : k.kind === 'garage' ? '#1f2937' : '#78350f';
    // painted sign board flush on the facade, between the awning and the roof
    if (small) addSign('MAÏGA', bg, '#f1e6c8', cx + 1.3, G + 2.6, cz + dir * (d / 2 + 0.03), dir > 0 ? 0 : Math.PI, 2.6, 0.7);
    else addSign(k.name.toUpperCase(), bg, '#fff7e0', cx, G + 3.55, cz + dir * (d / 2 + 0.03), dir > 0 ? 0 : Math.PI, 7.2, 1.0);
    const px = cx, pz = south ? blockMin(k.j) + BLK + 1.5 : blockMin(k.j) - 1.5;
    interactables.push({ id: `${id}:${k.kind}:${k.i}${k.j}`, name: k.name, kind: 'actions', x: px, z: pz, radius: 4.4, actions: k.kind === 'home' || k.kind === 'gargote' || k.kind === 'maiga' ? [ENTER, ...ACTIONS[k.kind]] : ACTIONS[k.kind] });
    return { px, pz, south, cx };
  };

  /** Street vendor's table under a parasol. */
  const stall = (x: number, z: number) => {
    plain.box(1.6, 0.8, 0.9, x, G, z, 0x8b6a47);
    for (let n = 0; n < 4; n++) plain.box(0.3, 0.2, 0.3, x - 0.55 + n * 0.37, G + 0.8, z + (R() - 0.5) * 0.4, pick([0xe58a2f, 0xc4372b, 0x6aa84f, 0xf4c20d, 0xf2f2ec], R));
    plain.box(0.05, 2.2, 0.05, x + 0.9, G, z, 0x555555);
    plain.cyl(0.05, 1.3, 0.4, x + 0.9, G + 2.1, z, pick([0xd9482b, 0x1e6fd9, 0xf4c20d, 0x2f8f4e], R), 8);
    plain.box(0.4, 0.4, 0.4, x - 1.3, G, z + 0.3, 0x3a5fa0);                          // stool
    solidC(x, z, 1.7, 1.0, 1);
  };

  const specialAt = (i: number, j: number, kind: Special) => {
    const bx = blockMin(i), bz = blockMin(j), cx = bx + BLK / 2, cz = bz + BLK / 2;
    const sandy = kind === 'pitch' || kind === 'arena' || kind === 'ecurie' || banlieue;
    (sandy ? plain : pave).box(BLK, G + 0.02, BLK, cx, 0, cz, kind === 'pitch' ? 0x5aa84f : kind === 'arena' || kind === 'ecurie' ? 0xd9bb8a : banlieue ? 0xcfb48a : 0xc9c0ac);
    const B = G + 0.02;
    switch (kind) {
      case 'mosque': {
        if (isComposed(id, `mosque:${i}${j}`)) {
          for (const sx of [-1, 1]) tree(cx + sx * 9, cz - 15, 1.1);          // the forecourt's two shade trees stay
          for (const sx of [-1, 1]) ghost(cx + sx * 15 - 1.6, cz - 9.6, cx + sx * 15 + 1.6, cz - 6.4, 26);   // old minarets and hall
          ghost(cx - 13, cz - 9, cx + 13, cz + 13, 11);
          sites.push({ key: `mosque:${i}${j}`, kind: 'mosque', name: 'Grande Mosquée', x0: bx, z0: bz, x1: bx + BLK, z1: bz + BLK, front: { x: 0, z: -1 } });
          break;
        }
        fac.facade(26, 11, 22, cx, B, cz + 2, 0xf6f3ea);
        plain.box(26.2, 0.7, 22.2, cx, B, cz + 2, 0xcfc7b4);
        plain.box(20, 1.2, 16, cx, 11.2, cz + 2, 0xe9e5d8);
        plain.sphere(7.5, cx, 12.4, cz + 2, 0x8fc7a8, true);
        plain.cyl(0.2, 0.2, 2, cx, 19.9, cz + 2, 0xd4b24a, 6);
        for (const sx of [-1, 1]) {
          plain.box(3.2, 26, 3.2, cx + sx * 15, B, cz - 8, 0xf6f3ea);
          for (const y of [8, 14]) plain.box(3.5, 0.4, 3.5, cx + sx * 15, y, cz - 8, 0xd9d2c0);
          plain.box(4, 1, 4, cx + sx * 15, 20, cz - 8, 0x3f8f6a); plain.cyl(0, 1.8, 4, cx + sx * 15, 26.2, cz - 8, 0x3f8f6a, 6); solidC(cx + sx * 15, cz - 8, 3.2, 3.2, 26);
        }
        plain.box(7, 6, 0.6, cx, B, cz - 8.7, 0x2b4b45);                               // entrance arch
        for (const sx of [-1, 1]) tree(cx + sx * 9, cz - 15, 1.1);
        solidC(cx, cz + 2, 26, 22, 11);
        addSign('GRANDE MOSQUÉE', '#0f3d33', '#f3ecd0', cx, 7.6, cz - 9.05, Math.PI, 7, 1.2);
        break;
      }
      case 'market': {
        const kits: Collider[] = [];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
          const sx = bx + 8 + c * 13, sz = bz + 7 + r * 9;
          const col = pick([0xd9482b, 0x2f8fd1, 0xe7b82f, 0x3aa35c, 0xc2417f], R);
          for (const dx of [-2.2, 2.2]) for (const dz of [-1.5, 1.5]) plain.box(0.15, 2.4, 0.15, sx + dx, B, sz + dz, 0x6b5a4a);
          plain.box(5.4, 0.12, 3.8, sx, 2.6, sz, col); plain.box(5.4, 0.3, 0.05, sx, 2.4, sz - 1.9, col); plain.box(5.4, 0.3, 0.05, sx, 2.4, sz + 1.9, col);
          plain.box(4.4, 0.9, 2.4, sx, B, sz, 0x8b6a47);
          for (let n = 0; n < 5; n++) plain.box(0.6, 0.35 + R() * 0.3, 0.6, sx - 1.6 + n * 0.8, B + 0.9, sz + (R() - 0.5) * 1.2, pick([0xe58a2f, 0xc4372b, 0x6aa84f, 0xf4c20d, 0xf2f2ec, 0x2f6fb3, 0xc2417f], R));
          kits.push({ x0: sx - 2.2, z0: sz - 1.2, x1: sx + 2.2, z1: sz + 1.2, h: 1.2 });
        }
        colliders.push(...kits);
        for (const sx of [-1, 1]) { plain.box(1, 6, 1, cx + sx * 6, B, bz - 0.6, 0xe9e1cf); }
        plain.box(13, 1.6, 0.6, cx, 5.4, bz - 0.6, 0xe9e1cf);
        addSign('MARCHÉ SANDAGA', '#7c2d12', '#ffe9b8', cx, 6.2, bz - 0.95, Math.PI, 8.5, 1.3);
        interactables.push({ id: `${id}:market`, name: 'Étal de Sandaga', kind: 'actions', x: bx + 8 + 13, z: bz + 7 + 4.5, radius: 4, actions: ACTIONS.market });
        break;
      }
      case 'station': {
        pave.box(26, 0.04, 14, cx, B, cz, 0x9a9488);
        for (let k = -2; k <= 2; k++) plain.box(0.2, 0.02, 5, cx - 3 + k * 0.01, B + 0.04, cz + k * 2.8, 0xe8e4d8, Math.PI / 2);
        const cr = makeCarRapide({ seed: sp.seed * 7 + 1, driver: false }); cr.position.set(cx - 3, B, cz); cr.rotation.y = Math.PI / 2; group.add(cr);
        const cr2 = makeCarRapide({ seed: sp.seed * 7 + 2, driver: false }); cr2.position.set(cx - 5, B, cz - 4.5); cr2.rotation.y = Math.PI / 2 + 0.08; group.add(cr2);
        rapides.push(cr, cr2);
        solidC(cx - 5, cz - 4.5, 6.6, 2.8, 2.4);
        plain.box(0.3, 4.5, 0.3, cx + 9, B, cz - 5, 0x444444);
        addSign('GARE · CAR RAPIDE', '#1e3a8a', '#fde68a', cx + 9, 4.6, cz - 5.2, Math.PI, 4.6, 1.0);
        plain.box(12, 0.15, 3.5, cx + 6, 3.2, cz + 4, 0x1e3a8a);                           // shelter
        plain.box(12, 0.4, 0.06, cx + 6, 2.95, cz + 2.25, 0xf4c20d);
        for (const dx of [0.2, 11.8]) plain.box(0.2, 3.1, 0.2, cx + dx, B, cz + 4, 0x444444);
        plain.box(8, 0.5, 1, cx + 6, B, cz + 4.6, 0x6b5a4a);                           // bench
        solidC(cx - 3, cz, 6.4, 2.6, 2.4);
        stall(cx - 10, cz + 6); stall(cx + 3, cz - 6.5);
        tree(cx + 11, cz + 8, 1.1); tree(cx - 11, cz - 8, 1);
        interactables.push({ id: `${id}:station`, name: 'Car rapide · changer de quartier', kind: 'travel', x: cx - 3, z: cz + 3.2, radius: 4.8, actions: [] });
        break;
      }
      case 'monument': {
        // Monument de la Renaissance africaine, after Habib's reference photos (7 Oct 2026). Stylised and scaled down.
        // A natural hill (dry grass, scrub, pink bougainvillea, palms) climbed by one long straight stair with white
        // parapets, railings and lamps; at the top the group rises out of angular rock with a tall rock slab beside
        // the man: the man (bare-chested, wrapped cloth, headband) holds the child seated on his raised left arm,
        // the child points out to sea; the woman leans forward at his right, arm flung back, hair and dress flowing.
        const HILL = 0xa8925f, STONE = 0xd9d4ca, BRONZE = 0x7a5f45, ROCK = 0x806549;
        const R0 = 22, R1 = 7, HH = 12;                                         // hill base/top radius, height
        const hAt = (r: number) => HH * THREE.MathUtils.clamp((R0 - r) / (R0 - R1), 0, 1);
        plain.cyl(R1, R0, HH, cx, B - 0.05, cz, HILL, 28);                      // the hill (a frustum: straight slopes)
        plain.cyl(R1 + 0.3, R1 + 0.3, 0.12, cx, B + HH - 0.05, cz, STONE, 24); // summit plaza
        const top = B + HH;
        // stair up the sea side (west, -x): treads sit on the slope; parapets, railings and lamps on both sides
        const SW = 7, steps = 34, x0 = cx - R0 - 0.6, x1 = cx - R1;
        for (let k = 0; k < steps; k++) {
          const xa = x0 + ((x1 - x0) * k) / steps, ya = B + hAt(cx - xa) + 0.05;
          plain.box((x1 - x0) / steps + 0.02, Math.max(0.12, ya - B + 0.35), SW, xa + (x1 - x0) / steps / 2, 0, cz, k % 2 ? 0xc9c4ba : 0xbdb8ae);
        }
        for (const sz of [-1, 1]) {
          const zz = cz + sz * (SW / 2 + 0.25);
          limb(plain, [x0, B + 0.5, zz], [x1, top + 0.5, zz], 0.32, 0.32, STONE, 4);        // white parapet
          limb(plain, [x0, B + 1.4, zz - sz * 0.1], [x1, top + 1.4, zz - sz * 0.1], 0.04, 0.04, 0x9aa0a6, 4); // handrail
          for (let k = 0; k <= 6; k++) {
            const xa = x0 + ((x1 - x0) * k) / 6, ya = B + hAt(cx - xa);
            plain.box(0.06, 1.0, 0.06, xa, ya + 0.4, zz - sz * 0.1, 0x9aa0a6);
            if (k % 2 === 0) { lampPosts.box(0.12, 3.2, 0.12, xa, ya + 0.6, zz + sz * 0.6, 0xd9d4ca); lampBulbs.sphere(0.28, xa, ya + 3.9, zz + sz * 0.6, 0xfff1d0); }
          }
        }
        // vegetation on the slopes, kept off the stair
        for (let n = 0; n < 70; n++) {
          const a = R() * Math.PI * 2;
          if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.42) continue;
          const r = R1 + 1 + R() * (R0 - R1 - 1.5), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          leaves.blob(0.7 + R() * 0.9, x, B + hAt(r) - 0.1, z, R() < 0.3 ? pick([0xd2468a, 0xc2307a, 0xe05a9a], R) : pick([0x5f7a3a, 0x7a8a46, 0x4f6a32], R), 0.6, 0);
        }
        for (let n = 0; n < 6; n++) { const a = (n / 6) * Math.PI * 2 + 0.5; if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.6) continue; palm(cx + Math.cos(a) * (R1 + 1.2), cz + Math.sin(a) * (R1 + 1.2), 0.9); }
        // statue group, local axes: a = toward the sea (-x), s = the statue's right (-z), u = up from the summit
        const k = 1.25;
        const W = (a: number, s2: number, u: number): [number, number, number] => [cx - a * k, top + u * k, cz - s2 * k];
        const L = (A: [number, number, number], Bp: [number, number, number], r0: number, r1: number, col = BRONZE) => limb(plain, W(...A), W(...Bp), r0 * k, r1 * k, col);
        const ball = (P: [number, number, number], r: number, col = BRONZE) => { const [x, y, z] = W(...P); plain.sphere(r * k, x, y, z, col); };
        const rock = (a: number, s2: number, u: number, w: number, h: number, d: number, rot: number) => { const [x, y, z] = W(a, s2, u); plain.box(w * k, h * k, d * k, x, y, z, ROCK, rot); };
        // angular rock the figures rise out of, stepping down toward the stair, and the tall slab at the man's left
        rock(0, 0.5, 0, 9, 3, 8, 0.1); rock(1.5, 0.2, 2.6, 6.5, 2.4, 6, -0.25); rock(2.6, -0.4, 4.6, 4.2, 2.2, 4.5, 0.35);
        rock(1.0, 2.6, 2.4, 4, 2.6, 3.2, 0.6); rock(-1.2, -1.6, 2.8, 4.5, 3.4, 4, -0.4);
        rock(-1.0, -4.4, 0, 2.6, 15.5, 2.4, 0.15); rock(-0.6, -4.9, 12, 1.8, 3.2, 1.6, 0.4);
        // man
        L([0.2, -0.7, 7.6], [2.3, -1.1, 6.1], 0.95, 0.85); L([2.3, -1.1, 6.1], [2.9, -1.2, 3.2], 0.85, 0.7);   // forward left leg, knee out of the rock
        L([0.0, 0.7, 7.6], [-0.4, 0.9, 4.5], 0.95, 0.8);
        L([0.0, 0, 7.2], [0.1, 0, 9.4], 1.75, 1.6, ROCK);                                                       // wrapped cloth
        L([0.1, 0, 9.2], [0.45, 0, 14.0], 1.55, 2.15);                                                           // torso, broad chest
        L([0.4, -2.1, 13.6], [0.4, 2.1, 13.6], 0.75, 0.75);                                                      // shoulders
        L([0.45, 0, 14.2], [0.55, 0, 15.0], 0.6, 0.6); ball([0.65, 0, 15.9], 1.0);
        L([0.6, 0, 16.5], [0.62, 0, 16.9], 0.92, 0.9, 0x5e4836);                                                 // headband
        L([0.4, -2.2, 13.7], [0.9, -3.8, 16.3], 0.65, 0.55);                                                     // raised left upper arm
        L([0.9, -3.8, 16.3], [1.0, -2.1, 17.4], 0.55, 0.45);                                                     // forearm back over the shoulder
        L([0.3, 2.2, 13.4], [0.2, 3.0, 11.0], 0.6, 0.5); L([0.2, 3.0, 11.0], [-0.5, 3.4, 9.6], 0.5, 0.42);      // right arm round the woman
        // child seated on the forearm, pointing out to sea
        L([1.0, -2.8, 17.6], [1.2, -2.8, 19.3], 0.55, 0.5); ball([1.3, -2.8, 20.0], 0.5);
        L([1.1, -2.6, 17.7], [1.8, -2.4, 16.9], 0.24, 0.2); L([1.1, -3.0, 17.7], [1.8, -3.2, 16.9], 0.24, 0.2); // dangling legs
        L([1.3, -2.5, 19.2], [3.4, -3.5, 20.9], 0.2, 0.15);                                                     // pointing arm
        // woman, leaning forward at his right
        L([1.4, 3.2, 3.0], [-0.3, 3.6, 7.6], 0.75, 0.85);                                                        // leg out of the rock
        L([-0.3, 3.6, 7.0], [-0.5, 3.7, 9.8], 1.25, 1.0, 0x725840);                                              // wrapped dress
        L([-0.4, 3.8, 7.6], [-2.4, 4.4, 6.7], 0.8, 0.25, 0x725840);                                              // dress flowing back
        L([-0.5, 3.7, 9.6], [-0.2, 3.6, 12.5], 1.0, 1.1); ball([0.0, 3.5, 13.5], 0.72);
        L([-0.1, 3.5, 13.8], [-1.9, 3.9, 14.1], 0.5, 0.15);                                                      // hair streaming back
        L([-0.3, 4.4, 12.0], [-2.0, 5.9, 10.8], 0.42, 0.38); L([-2.0, 5.9, 10.8], [-3.6, 7.2, 9.6], 0.38, 0.3);  // arm flung back
        // hill collider: square plus cross approximate the round hill; the block corners stay free
        // The stair is walkable: a corridor |z - cz| < 3.3 from the foot (x0) to the summit terrace in front of the rock.
        // Everything else on the hill collides (square and cross approximate the round hill; block corners stay free).
        const SH = SW / 2 - 0.2, rockX = cx - 5.4;
        solid(rockX, cz - 16, cx + 16, cz + 16, top + 2);
        solid(cx - 22, cz - 16, rockX, cz - SH, top + 2); solid(cx - 22, cz + SH, rockX, cz + 16, top + 2);
        solid(cx - 8, cz - 22, cx + 8, cz - 16, top); solid(cx - 8, cz + 16, cx + 8, cz + 22, top); solid(cx + 16, cz - 8, cx + 22, cz + 8, top);
        ramps.push({ x0, x1, z0: cz - SH, z1: cz + SH, y0: 0.3, y1: HH + 0.2, xEnd: rockX });          // tread tops are hAt + 0.4; feet sit at 0.1 + height
        plain.box(0.5, 1.6, 9, cx - R0 - 2.2, B, cz + 9, STONE);                                                // name plaque wall at the stair foot
        addSign('MONUMENT DE LA RENAISSANCE AFRICAINE', '#14212b', '#d8e2dc', cx - R0 - 2.47, B + 0.85, cz + 9, -Math.PI / 2, 8, 1.0);
        // festive corners: a canopy, speakers and bunting (people in actors/life.ts)
        const spots = [{ x: cx + 17, z: cz + 17 }, { x: cx - 17, z: cz + 17 }];
        for (const [n, sp2] of spots.entries()) {
          const col = n ? 0xd9322b : 0x1a9d54;
          for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) plain.box(0.1, 2.6, 0.1, sp2.x + dx, B, sp2.z + dz, 0x555555);
          awning(sp2.x, sp2.z, 5.2, 5.2, 2.85, col, true, 1);
          plain.box(0.6, 1.1, 0.5, sp2.x + 2.2, B, sp2.z - 2.2, 0x1d1d1f); plain.box(0.6, 1.1, 0.5, sp2.x - 2.2, B, sp2.z - 2.2, 0x1d1d1f);
          for (let f = 0; f < 8; f++) plain.box(0.35, 0.45, 0.02, sp2.x - 2.6 + f * 0.75, 2.45, sp2.z + 2.6, [0x1a9d54, 0xf4c20d, 0xd9322b][f % 3]);
        }
        monumentInfo = { cx, cz, stairX0: x0, stairX1: x1, stairZ: cz, y0: B + 0.35, y1: top + 0.05, spots };
        break;
      }
      case 'gym': {
        plain.box(26, 0.06, 18, cx, B, cz, 0x9b4f3c);
        for (let k = 0; k < 3; k++) { const gx = cx - 8 + k * 8; plain.box(0.25, 3.2, 0.25, gx - 1.6, B, cz - 4, 0x2d3748); plain.box(0.25, 3.2, 0.25, gx + 1.6, B, cz - 4, 0x2d3748); plain.box(3.6, 0.2, 0.2, gx, B + 3.1, cz - 4, 0xd9d9d9); solidC(gx, cz - 4, 3.8, 0.6, 3.5); }
        plain.box(6, 0.5, 1, cx, B, cz + 5, 0x2f5f86);
        for (const sx of [-1, 1]) tree(cx + sx * 15, cz + 6, 1.1);
        addSign('SALLE EN PLEIN AIR', '#1f2937', '#fde68a', cx, 4.4, cz - 4.15, Math.PI, 5.6, 1.0);
        interactables.push({ id: `${id}:gym`, name: 'Salle de sport en plein air', kind: 'actions', x: cx, z: cz + 2, radius: 6, actions: ACTIONS.gym });
        break;
      }
      case 'pitch': {
        const w = 40, d = 30;
        plain.box(w + 4, 0.02, d + 4, cx, B, cz, 0x4e9a45);
        for (let k = 0; k < 8; k++) plain.box(w / 8, 0.01, d, cx - w / 2 + (k + 0.5) * (w / 8), B + 0.02, cz, k % 2 ? 0x5aa84f : 0x52a048); // mowing stripes
        plain.box(w + 2, 0.02, 0.3, cx, B + 0.03, cz - d / 2, 0xffffff); plain.box(w + 2, 0.02, 0.3, cx, B + 0.03, cz + d / 2, 0xffffff);
        plain.box(0.3, 0.02, d, cx - w / 2, B + 0.03, cz, 0xffffff); plain.box(0.3, 0.02, d, cx + w / 2, B + 0.03, cz, 0xffffff); plain.box(0.3, 0.02, d, cx, B + 0.03, cz, 0xffffff);
        for (const sx of [-1, 1]) { plain.box(0.2, 2.4, 0.2, cx + sx * (w / 2), B, cz - 3, 0xffffff); plain.box(0.2, 2.4, 0.2, cx + sx * (w / 2), B, cz + 3, 0xffffff); plain.box(0.2, 0.2, 6, cx + sx * (w / 2), B + 2.4, cz, 0xffffff); }
        break;
      }
      case 'port': {
        plain.box(6, 0.4, 36, cx, B, bz - 8, 0x8b6a47);                                 // pier toward the sea
        for (let k = 0; k < 12; k++) plain.box(6.05, 0.05, 0.12, cx, B + 0.4, bz - 25 + k * 3, 0x6b4f33);
        const cols = [0x1e6fd9, 0xe7b82f, 0xd9482b, 0x2f8f4e];
        for (let k = 0; k < 5; k++) {
          // painted pirogues on the beach
          const bx2 = cx - 17 + k * 8, bz2 = bz - 16 - R() * 4;
          plain.box(1.8, 0.9, 9, bx2, 0.05, bz2, cols[k % 4]);
          plain.box(1.9, 0.25, 9.1, bx2, 0.95, bz2, cols[(k + 1) % 4]);
          plain.box(1.2, 1.1, 1.8, bx2, 0.05, bz2 - 5.1, cols[(k + 2) % 4]);
          plain.box(1.2, 1.1, 1.8, bx2, 0.05, bz2 + 5.1, cols[(k + 2) % 4]);
          plain.box(0.1, 1.2, 0.1, bx2, 1.2, bz2 - 5.5, 0xf2f2ec);
        }
        for (let k = 0; k < 3; k++) { plain.box(5, 0.15, 3, bx + 8 + k * 14, 2.4, cz + 6, 0x3b82f6); plain.box(4, 0.8, 2.4, bx + 8 + k * 14, B, cz + 6, 0xdbeafe); for (const s of [-1, 1]) plain.box(0.1, 2.3, 0.1, bx + 8 + k * 14 + s * 2.4, B, cz + 6 - 1.4, 0x555555); }
        addSign('PORT DE PÊCHE · NGOR', '#0c4a6e', '#e0f2fe', cx, 3.4, bz + 1, 0, 6, 1.1);
        plain.box(0.2, 3.4, 0.2, cx - 3, B, bz + 1, 0x555555); plain.box(0.2, 3.4, 0.2, cx + 3, B, bz + 1, 0x555555);
        interactables.push({ id: `${id}:port`, name: 'Port de pêche', kind: 'actions', x: cx, z: bz + 4, radius: 5, actions: ACTIONS.port });
        break;
      }
      case 'arena': {
        // Géew (the arena circle): sand floor, sandbag ring of the mbër, ring-side furniture, three raised tiers of stands
        // under a roof (the scene crowd stands on the tiers; dimensions shared with lamb/scenes.ts through world/geew.ts),
        // outer wall, gate and floodlights. Ring side after Habib's arena photos (7 Oct): white sandbags with a traced line inside,
        // low sponsor boards just outside, judges' chairs, an officials' table under a canopy, crowd barriers, a bannered
        // parapet in front of the stands and feather flags. Boards and banners are blank colour panels (no real sponsors).
        ringSand.cyl(17.3, 17.3, 0.04, cx, B, cz, 0xead6a8, 40);                         // trampled sand (#31)
        for (let s = 0; s < 64; s++) {                                                  // white sandbag ring of the combat circle
          const a = (s / 64) * Math.PI * 2;
          plain.blob(0.46, cx + Math.sin(a) * 9, B + 0.1, cz + Math.cos(a) * 9, s % 3 ? 0xf3f0e8 : 0xe2ddd0, 0.4, 1);
        }
        for (let s = 0; s < 72; s++) {                                                  // white line traced in the sand inside the bags
          const a = (s / 72) * Math.PI * 2;
          plain.flat((2 * Math.PI * 8.3) / 72 + 0.02, 0.14, cx + Math.sin(a) * 8.3, B + 0.05, cz + Math.cos(a) * 8.3, 0xf7f4ec, a);
        }
        const gateGap = inGate;
        const BOARD = [0xf2f2ec, 0x1e6fd9, 0xd9482b, 0x2f8f4e, 0xf4c20d, 0x0f3d6e];
        for (let s = 0; s < 26; s++) {                                                  // sponsor boards around the ring
          const a = ((s + 0.5) / 26) * Math.PI * 2;
          if (gateGap(a, 0.36)) continue;
          const x = cx + Math.sin(a) * 10.6, z = cz + Math.cos(a) * 10.6, col = BOARD[s % BOARD.length];
          plain.box(2.1, 0.75, 0.08, x, B, z, 0xf2f2ec, a);
          plain.box(1.9, 0.5, 0.02, x + Math.sin(a) * -0.05, B + 0.13, z + Math.cos(a) * -0.05, col, a);   // panel facing the ring
          solidC(x, z, 1.4, 1.4, 0.75);
        }
        for (const a of [0, Math.PI / 2, (3 * Math.PI) / 2, Math.PI / 4, -Math.PI / 4]) { // judges' folding chairs at the bags
          const x = cx + Math.sin(a) * 9.9, z = cz + Math.cos(a) * 9.9;
          plain.box(0.46, 0.45, 0.44, x, B, z, 0x2b2f36, a); plain.box(0.46, 0.5, 0.05, x + Math.sin(a) * 0.2, B + 0.45, z + Math.cos(a) * 0.2, 0x2b2f36, a);
        }
        {                                                                               // officials' table under a canopy (+x side)
          const tx = cx + 13.2, tz = cz + 2;
          plain.box(3.2, 0.75, 0.9, tx, B, tz, 0xf2f2ec);
          for (let n = 0; n < 4; n++) plain.box(0.45, 0.45, 0.45, tx - 1.2 + n * 0.8, B, tz + 0.8, 0x3a5fa0);
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plain.box(0.07, 2.6, 0.07, tx + sx * 2, B, tz + sz * 1.5, 0xd8d8d8);
          plain.box(4.4, 0.12, 3.4, tx, B + 2.6, tz, 0x2f8f4e);
          for (const sz of [-1, 1]) plain.box(4.4, 0.35, 0.03, tx, B + 2.3, tz + sz * 1.7, 0xf4c20d);
          solidC(tx, tz, 3.2, 1.8, 0.9);
        }
        for (let s = 0; s < 64; s++) {                                                  // metal crowd barriers in front of the parapet
          const a = ((s + 0.5) / 64) * Math.PI * 2;
          if (gateGap(a)) continue;
          const r = 16.4, wSeg = (2 * Math.PI * r) / 64, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
          plain.box(wSeg - 0.12, 0.05, 0.05, x, B + 1.0, z, 0xa9adb3, a);
          plain.box(wSeg - 0.12, 0.05, 0.05, x, B + 0.25, z, 0xa9adb3, a);
          for (let v = 0; v < 4; v++) { const o = (v / 3 - 0.5) * (wSeg - 0.2); plain.box(0.03, 0.8, 0.03, x + Math.cos(a) * o, B + 0.25, z - Math.sin(a) * o, 0xa9adb3, a); }
        }
        for (let s = 0; s < 48; s++) {                                                  // bannered parapet in front of the first tier
          const a = ((s + 0.5) / 48) * Math.PI * 2;
          if (gateGap(a)) continue;
          const r = PARAPET_R, wSeg = (2 * Math.PI * r) / 48 + 0.05, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
          plain.box(wSeg, PARAPET_H, 0.22, x, 0, z, 0xe9e4d8, a);
          if (s % 2 === 0) plain.box(wSeg * 1.6, 0.62, 0.03, cx + Math.sin(a) * (r - 0.13), 0.24, cz + Math.cos(a) * (r - 0.13), BOARD[(s / 2) % BOARD.length], a);
        }
        if (!lite) for (let s = 0; s < 10; s++) {                                       // feather flags along the barriers
          const a = ((s + 0.5) / 10) * Math.PI * 2 + 0.15;
          if (gateGap(a, 0.5)) continue;
          const x = cx + Math.sin(a) * 15.6, z = cz + Math.cos(a) * 15.6, col = BOARD[(s + 1) % BOARD.length];
          plain.box(0.05, 3.6, 0.05, x, B, z, 0x555555);
          plain.box(0.7, 2.6, 0.03, x + Math.cos(a) * 0.37, B + 0.8, z - Math.sin(a) * 0.37, col, a);
          plain.box(0.6, 0.5, 0.03, x + Math.cos(a) * 0.32, B + 3.4, z - Math.sin(a) * 0.32, col, a);
        }
        const TIER_COL = [0xd5cbb8, 0xc6bba6, 0xb7ab95];
        const FLAG = [0x1a9d54, 0xf4c20d, 0xd9322b];
        for (let t = 0; t < TIERS; t++) {                                               // raised tiers (TEMP concrete), one level only
          const r = tierRadius(t), top = tierTop(t), segs = 48;
          for (let s = 0; s < segs; s++) {
            const a = ((s + 0.5) / segs) * Math.PI * 2;
            if (gateGap(a)) continue;
            const wSeg = (2 * Math.PI * r) / segs + 0.06;
            concrete.box(wSeg, top, TIER_DEPTH, cx + Math.sin(a) * r, 0, cz + Math.cos(a) * r, TIER_COL[t], a);  // cast concrete (#11)
            plain.box(wSeg, 0.12, 0.06, cx + Math.sin(a) * (r - 0.67), top - 0.18, cz + Math.cos(a) * (r - 0.67), FLAG[Math.floor(s / 4) % 3], a); // painted riser band
            plain.box(wSeg, 0.06, 0.12, cx + Math.sin(a) * (r - 0.6), top, cz + Math.cos(a) * (r - 0.6), 0xe9e4d8, a);  // worn seat edge
          }
        }
        const wallR = WALL_R, wallH = WALL_H, wsegs = 40;
        for (let s = 0; s < wsegs; s++) {
          const a = ((s + 0.5) / wsegs) * Math.PI * 2;
          if (gateGap(a)) continue;
          const wSeg = (2 * Math.PI * wallR) / wsegs + 0.1;
          const x = cx + Math.sin(a) * wallR, z = cz + Math.cos(a) * wallR;
          plain.box(wSeg, wallH, 0.5, x, 0, z, 0xd9a45a, a);
          plain.box(wSeg + 0.02, 0.3, 0.6, x, wallH - 0.1, z, 0xf1ead8, a);
          plain.box(wSeg + 0.02, 0.6, 0.56, x, 0, z, 0xa77a40, a);
          if (s % 3 === 0) plain.box(wSeg * 0.7, 1.4, 0.05, cx + Math.sin(a) * (wallR + 0.28), 1.3, cz + Math.cos(a) * (wallR + 0.28), FLAG[(s / 3) % 3], a); // painted banner
          solidC(x, z, 3.6, 3.6, wallH);
        }
        // stands collide too (player cannot climb them); their height reaches the roof so the follow camera stays under it
        for (let t = 0; t < TIERS; t++) for (let s = 0; s < 24; s++) {
          const a = ((s + 0.5) / 24) * Math.PI * 2; if (gateGap(a)) continue;
          const r = tierRadius(t); solidC(cx + Math.sin(a) * r, cz + Math.cos(a) * r, 2.6, 2.6, roofY(r));
        }
        {                                                                               // roof over the stands (TEMP painted sheet metal)
          const segs = 40, rm = (ROOF_FRONT_R + ROOF_BACK_R) / 2, ym = (ROOF_FRONT_Y + ROOF_BACK_Y) / 2;
          const run = ROOF_BACK_R - ROOF_FRONT_R, rise = ROOF_FRONT_Y - ROOF_BACK_Y, tilt = Math.atan2(rise, run), depth = Math.hypot(run, rise);
          for (let s = 0; s < segs; s++) {
            const a = ((s + 0.5) / segs) * Math.PI * 2;
            if (gateGap(a)) continue;
            const sa = Math.sin(a), ca = Math.cos(a), wSeg = (2 * Math.PI * ROOF_BACK_R) / segs + 0.04;
            roofSheet.slab(wSeg, 0.16, depth, cx + sa * rm, ym, cz + ca * rm, s % 2 ? 0xc4c9cf : 0xb9bfc6, a, tilt);  // galvanized sheet (#25)
            plain.box(wSeg * (ROOF_FRONT_R / ROOF_BACK_R) + 0.1, 0.5, 0.08, cx + sa * (ROOF_FRONT_R - 0.02), ROOF_FRONT_Y - 0.42, cz + ca * (ROOF_FRONT_R - 0.02), 0xf1ead8, a); // fascia
            if (s % 2) continue;
            // column on the outer wall, cantilever beam under the roof, and a strut
            const top = roofY(wallR) - 0.1, bx = cx + sa * wallR, bz = cz + ca * wallR;
            plain.box(0.4, top - wallH, 0.4, bx, wallH, bz, 0x8d9299, a);
            limb(plain, [bx, top, bz], [cx + sa * (ROOF_FRONT_R + 0.4), roofY(ROOF_FRONT_R + 0.4) - 0.12, cz + ca * (ROOF_FRONT_R + 0.4)], 0.13, 0.08, 0x7d838a, 6);
            if (!lite) limb(plain, [bx, wallH + 0.4, bz], [cx + sa * 19.6, roofY(19.6) - 0.14, cz + ca * 19.6], 0.07, 0.07, 0x7d838a, 5);
          }
        }
        // entrance arch at the gate (-z)
        const gz = cz - wallR;
        for (const sx of [-1, 1]) { plain.box(1.2, 6.4, 1.4, cx + sx * 4.6, 0, gz, 0xc98a3a); plain.box(1.4, 0.4, 1.6, cx + sx * 4.6, 6.4, gz, 0xf1ead8); solidC(cx + sx * 4.6, gz, 1.2, 1.4, 6.4); }
        plain.box(10.4, 1.6, 1.0, cx, 5.2, gz, 0x7a3f1a);
        addSign('ARÈNE · LÀMB', '#3b1d0b', '#ffd98a', cx, 6.0, gz - 0.52, Math.PI, 7.6, 1.2);
        for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { plain.box(0.08, 4.2, 0.08, cx + sx * (6.2 + k * 2.2), 0, gz - 1.6, 0x555555); plain.box(1.4, 0.9, 0.04, cx + sx * (6.2 + k * 2.2) + sx * 0.7, 3.2, gz - 1.6, FLAG[k]); }
        // floodlight masts
        for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
          const x = cx + Math.sin(a) * (wallR + 1.6), z = cz + Math.cos(a) * (wallR + 1.6);
          lampPosts.box(0.4, 15, 0.4, x, 0, z, 0x6b6f75);
          lampPosts.box(3, 1.4, 0.4, x - Math.sin(a) * 0.4, 15, z - Math.cos(a) * 0.4, 0x3d4047, a);
          lampBulbs.box(2.7, 1.1, 0.05, x - Math.sin(a) * 0.62, 15.15, z - Math.cos(a) * 0.62, 0xfff3d0, a);
          solidC(x, z, 0.6, 0.6, 15);
        }
        // After Higgsfield reference #24 (artistic interpretation; set-up UNREVIEWED). The ring side follows Habib's photos above.
        // outside: crowd barriers along the queue to the gate, and vendors under parasols
        const gzz = cz - wallR;
        for (const sx of [-1, 1]) for (let k2 = 0; k2 < 6; k2++) {
          const bz2 = gzz - 2.5 - k2 * 2.2, bx2 = cx + sx * 2.6;
          for (const y of [0.15, 1.05]) plain.box(0.04, 0.04, 2.1, bx2, B + y, bz2, 0xa8adb1);           // open steel frame
          for (let v = 0; v < 9; v++) plain.box(0.025, 0.9, 0.025, bx2, B + 0.15, bz2 - 1.0 + v * 0.25, 0xb8bdc1);
          plain.box(0.4, 0.03, 0.3, bx2, B, bz2 - 0.9, 0xa8adb1); plain.box(0.4, 0.03, 0.3, bx2, B, bz2 + 0.9, 0xa8adb1);
        }
        for (const sx of [-1, 1]) for (let k2 = 0; k2 < 2; k2++) stall(cx + sx * (8 + k2 * 4.5), gzz - 4 - k2 * 1.5);
        interactables.push({ id: `${id}:arena`, name: 'Arène · làmb', kind: 'actions', x: cx, z: cz - 24, radius: 5, actions: ACTIONS.arena });
        arenaInfo = { cx, cz, r: 19 };
        break;
      }
      case 'ecurie': {
        const w = 18, d = 14;
        fac.facade(w, 6, d, cx, B, cz + 6, 0xe0ad5a);
        plain.box(w + 0.1, 0.7, d + 0.1, cx, B, cz + 6, 0xa77a40);
        plain.box(w + 0.4, 0.3, d + 0.4, cx, B + 6, cz + 6, 0xc9bb9c);
        parapet(cx, cz + 6, w + 0.4, d + 0.4, B + 6.3, 0xd9a45a, 0.6);
        awning(cx, cz - 2.2, w - 2, 4, 4.4, 0x2f8f4e, true, -1);
        for (const sx of [-1, 1]) for (const z of [-4, -0.4]) plain.box(0.15, 4.2, 0.15, cx + sx * (w / 2 - 1.2), B, cz + z, 0x5a3f2a);
        plain.cyl(6, 6, 0.04, cx, B, cz - 8, 0xe2c792, 28);                              // training sand
        for (let s = 0; s < 28; s++) { const a = (s / 28) * Math.PI * 2; plain.blob(0.36, cx + Math.sin(a) * 6, B + 0.1, cz - 8 + Math.cos(a) * 6, s % 2 ? 0xe9e2d0 : 0xd8cfb8, 0.45, 0); }
        for (let n = 0; n < 3; n++) plain.cyl(0.42, 0.42, 0.3, cx + 9, B + n * 0.3, cz - 12 + n * 0.1, 0x1d1d1f, 10); // tyre stack
        plain.box(1.6, 0.4, 0.5, cx - 9, B, cz - 12, 0x6b4a2e);                         // bench
        tree(cx - 14, cz - 14, 1.2); tree(cx + 14, cz - 3, 1.1, true);
        solidC(cx, cz + 6, w, d, 6);
        addSign('ÉCURIE BAOBAB', '#3b1d0b', '#ffd98a', cx, B + 5.1, cz - 1.05, Math.PI, 7, 1.1);
        interactables.push({ id: `${id}:ecurie`, name: 'Écurie Baobab', kind: 'actions', x: cx, z: cz - 6, radius: 5, actions: ACTIONS.ecurie });
        ecurieInfo = { cx, cz: cz - 8 };
        break;
      }
      case 'plaza': default: break;
    }
  };

  // Populate the grid.
  const kioskLots = new Map<string, KioskSpec>();
  for (const k of sp.kiosks) kioskLots.set(`${k.i},${k.j},${k.lot}`, k);
  let spawn = { x: 0, z: 0, yaw: 0 };
  let arenaInfo: HubWorld['arena'] = null, ecurieInfo: HubWorld['ecurie'] = null, monumentInfo: HubWorld['monument'] = null;
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const key = `${i},${j}`;
    const city = CITY_BLOCKS[id][key];
    if (city) {
      buildCityBlock({ hub: id, lite, plain, glass, pave, floor: terrazzo, people, interactables, colliders, seats, sign: addSign, tree, pool }, city, blockMin(i) + BLK / 2, blockMin(j) + BLK / 2);
      continue;
    }
    const s = sp.specials[key];
    if (s) { specialAt(i, j, s); continue; }
    for (let lot = 0; lot < 4; lot++) {
      const k = kioskLots.get(`${i},${j},${lot}`);
      if (k) {
        if (k.kind === 'dibiterie') { if (isComposed(id, `dibiterie:${k.i}${k.j}`)) composedLot(k); else dibiterie(k); continue; }
        const info = kioskAt(k);
        if (k.kind === 'home') {
          // Face the home at an angle: the camera stays on the street side and the first view shows the neighbourhood.
          spawn = { x: info.cx, z: info.pz, yaw: (info.south ? Math.PI : 0) + 0.95 };
        }
        continue;
      }
      buildLotBuilding(i, j, lot % 2, lot >> 1);
    }
  }
  const [si, sj] = sp.spawnBlock;
  if (id !== 'pikine') {
    const sx = blockMin(si) + BLK / 2, sz = blockMin(sj) + BLK / 2;
    // beside the waiting car rapide, looking down the street so the first view shows the neighbourhood
    spawn = { x: sx - 3, z: sz + 7, yaw: Math.PI + 0.75 };
  }

  // Street lamps (post, arm over the road, lamp head) with a light pool on the ground at night; shade trees between them.
  // The new blocks have their own trees and furniture; random street props must not obstruct their aisles.
  const cityRects = Object.keys(CITY_BLOCKS[id]).map(key => { const [i, j] = key.split(',').map(Number); return { x: blockMin(i), z: blockMin(j) }; });
  const blocked = (x: number, z: number, r: number) => colliders.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r)
    || cityRects.some(c => x > c.x - r && x < c.x + BLK + r && z > c.z - r && z < c.z + BLK + r);
  const off = ROAD / 2 - SIDEWALK + 0.6; // lamp posts stand at the kerb
  for (let k = 0; k <= NB; k++) {
    for (let t = -HALF + 14; t < HALF - 8; t += 30) {
      for (const s of [-1, 1]) {
        const tt = t + (s > 0 ? 15 : 0);
        for (const along of [true, false]) {
          const x = along ? roadC(k) + s * off : tt, z = along ? tt : roadC(k) + s * off;
          if (Math.abs((along ? z : x) - roadC(Math.round((((along ? z : x) + HALF - ROAD / 2) / PITCH)))) < ROAD / 2 + 1) continue; // not in intersections
          if (sp.sea === 'west' && along && k === 0) continue;                         // the Corniche has median lamps
          const ax = along ? -s : 0, az = along ? 0 : -s;   // arm points over the road
          lampPosts.cyl(0.08, 0.12, 6.4, x, 0, z, 0x3d4047, 6);
          lampPosts.box(along ? 1.6 : 0.1, 0.1, along ? 0.1 : 1.6, x + ax * 0.8, 6.3, z + az * 0.8, 0x3d4047);
          lampPosts.box(0.7, 0.18, 0.4, x + ax * 1.5, 6.2, z + az * 1.5, 0x3d4047, along ? 0 : Math.PI / 2);
          lampBulbs.box(0.55, 0.06, 0.3, x + ax * 1.5, 6.14, z + az * 1.5, 0xffe2a0, along ? 0 : Math.PI / 2);
          pool(x + ax * 1.5, z + az * 1.5, 5.5);
        }
      }
    }
  }
  const treeOff = ROAD / 2 + 0.9;
  for (let k = 0; k <= NB; k++) for (let t = -HALF + 22; t < HALF - 8; t += 30) for (const s of [-1, 1]) for (const along of [true, false]) {
    if (R() < (banlieue ? 0.45 : sp.style === 'villa' ? 0.5 : 0.35)) continue;
    const tt = t + (s > 0 ? 15 : 0) + (R() - 0.5) * 4;
    const x = along ? roadC(k) + s * treeOff : tt, z = along ? tt : roadC(k) + s * treeOff;
    if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4 || blocked(x, z, 0.6)) continue;
    if (Math.abs((along ? z : x) - roadC(Math.round((((along ? z : x) + HALF - ROAD / 2) / PITCH)))) < ROAD / 2 + 2) continue;
    dress(x, z, () => { if (sp.style === 'villa' || sp.style === 'student') palm(x, z, 0.9 + R() * 0.3); else tree(x, z, 0.9 + R() * 0.3, banlieue && R() < 0.2); });
  }
  let placed = 0;
  while (placed < sp.palms) {
    const k = Math.floor(R() * (NB + 1)), t = -HALF + 10 + R() * (size - 20), o2 = (R() < 0.5 ? -1 : 1) * (ROAD / 2 + 2.4);
    const alongX = R() < 0.5;
    const x = alongX ? t : roadC(k) + o2, z = alongX ? roadC(k) + o2 : t;
    placed++;
    if (sp.sea === 'west' && x < -HALF + 8) continue;
    if (blocked(x, z, 0.8)) continue;
    dress(x, z, () => palm(x, z, 0.9 + R() * 0.4));
  }
  if (sp.sea === 'west') for (let z = -HALF + 6; z < HALF - 4; z += 9) { if (Math.abs(z - roadC(Math.round((z + HALF - ROAD / 2) / PITCH))) > ROAD / 2 + 1) palm(-HALF - 1.2, z, 1.15, true); } // whitewashed trunks
  if (sp.sea === 'north') for (let x = -HALF + 10; x < HALF - 6; x += 18) palm(x, -HALF - 3, 1.1);
  // A few street vendors on the sidewalks.
  for (let n = 0; n < (banlieue ? 8 : 5); n++) {
    const k = Math.floor(R() * (NB + 1)), t = -HALF + 20 + R() * (size - 40), s = R() < 0.5 ? -1 : 1, along = R() < 0.5;
    const x = along ? roadC(k) + s * (ROAD / 2 + 1.6) : t, z = along ? t : roadC(k) + s * (ROAD / 2 + 1.6);
    if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4 || blocked(x, z, 1.2)) continue;
    if (Math.abs((along ? z : x) - roadC(Math.round((((along ? z : x) + HALF - ROAD / 2) / PITCH)))) < ROAD / 2 + 3) continue;
    dress(x, z, () => stall(x, z));
  }

  for (const c of ghosts) colliders.splice(colliders.indexOf(c), 1);   // the venues module builds the real ones
  for (const [b, m, shadow] of [[plain, plainMat, true], [fac, facadeMat, true], [lampPosts, plainMat, true], [lampBulbs, lampMat, false], [glass, glassMat, false], [water, glassMat, false], [leaves, leafMat, true], [pave, paveMat, false], [blocks, blockMat, true], [metal, metalMat, true],
    [asphalt, asphaltMat, false], [tileRoof, tileRoofMat, true], [tin, tinMat, true], [trunks, trunkMat, true], [concrete, concreteMat, true],
    [ringSand, ringSandMat, false], [terrazzo, terrazzoMat, false], [roofSheet, roofSheetMat, true]] as [Batch, THREE.Material, boolean][]) {
    const mesh = b.build(m, true, shadow); if (mesh) group.add(mesh);
  }
  const lampGlow = new THREE.Mesh(mergeGeometries(pools, false)!, new THREE.MeshBasicMaterial({ map: lightPoolTexture(), color: 0xffb860, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  lampGlow.visible = false; lampGlow.renderOrder = 1; group.add(lampGlow);
  for (const s of signs) (s.material as THREE.MeshLambertMaterial).emissiveMap = (s.material as THREE.MeshLambertMaterial).map;
  // Grill smoke: a few soft sprites per grill rising, spreading and fading (looped, local only).
  const smoke: { s: THREE.Sprite; o: { x: number; y: number; z: number }; t: number }[] = [];
  if (smokeAt.length) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d')!, gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(235,235,232,0.9)'); gr.addColorStop(0.6, 'rgba(220,220,216,0.35)'); gr.addColorStop(1, 'rgba(210,210,205,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    for (const o of smokeAt) for (let n = 0; n < (lite ? 4 : 9); n++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5 }));
      sp.renderOrder = 2; group.add(sp); smoke.push({ s: sp, o, t: n / (lite ? 4 : 9) });
    }
  }
  const tick = (dt: number) => {
    for (const p of smoke) {
      p.t = (p.t + dt * 0.28) % 1;
      const k = p.t, m = p.s.material as THREE.SpriteMaterial;
      p.s.position.set(p.o.x + Math.sin(k * 5 + p.o.z) * 0.3 + k * 0.6, p.o.y + k * 3.2, p.o.z + Math.cos(k * 4) * 0.2);
      p.s.scale.setScalar(0.5 + k * 1.8); m.opacity = 0.55 * (1 - k) * Math.min(1, k * 6);
    }
  };

  return {
    id, group, colliders, interactables, bounds, spawn, edges, nodes, lamps: lampMat, facadeMat, lampGlow, signs,
    tick,
    heightAt(x: number, z: number) {
      for (const r of ramps) {
        if (z < r.z0 || z > r.z1 || x < r.x0 || x > r.xEnd) continue;
        return x >= r.x1 ? r.y1 : r.y0 + ((x - r.x0) / (r.x1 - r.x0)) * (r.y1 - r.y0);
      }
      return 0;
    },
    people, seats, rapides, skyDay: 0, arena: arenaInfo, ecurie: ecurieInfo, monument: monumentInfo, sites,
    dispose() { disposeGroup(group); },
  };
}
