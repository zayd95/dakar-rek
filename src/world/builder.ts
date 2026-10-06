import * as THREE from 'three';
import type { HubId } from '../core/types';
import { rng, pick } from '../core/rng';
import { Batch, facadeTextures, signTexture } from './batch';
import { ACTIONS } from './content';
import type { Collider, HubWorld, Interactable, RoadEdge } from './types';
import { makeCarRapide } from '../actors/vehicles';

export const PITCH = 60, BLK = 46, ROAD = 14, NB = 4;
export const HALF = (NB * PITCH + ROAD) / 2;
const LS = (BLK - 2) / 2; // lot size
const roadC = (k: number) => -HALF + ROAD / 2 + k * PITCH;
const blockMin = (i: number) => -HALF + ROAD + i * PITCH;

type Special = 'mosque' | 'market' | 'station' | 'monument' | 'gym' | 'pitch' | 'port' | 'arena' | 'ecurie' | 'plaza';
type KioskKind = 'gargote' | 'restaurant' | 'cafe' | 'garage' | 'home';
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
    kiosks: [{ i: 1, j: 2, lot: 3, kind: 'gargote', name: 'Gargote Chez Fatou' }, { i: 3, j: 2, lot: 0, kind: 'cafe', name: 'Café Touba · Sandaga' }],
    spawnBlock: [2, 2],
  },
  corniche: {
    id: 'corniche', seed: 23, style: 'student', ground: 0xd8c690, road: 0x4d5056, walk: 0xcfc8b4, blockGround: 0xb7c7a2,
    palette: [0xf0e0c4, 0xdfe6e8, 0xe9cfae, 0xcfe0d6, 0xf3d9b8], floors: [2, 4], sea: 'west', palms: 22,
    specials: { '0,1': 'gym', '0,2': 'pitch', '1,0': 'monument', '2,2': 'station' },
    kiosks: [{ i: 1, j: 2, lot: 0, kind: 'cafe', name: 'Café Touba · Fann' }, { i: 2, j: 1, lot: 2, kind: 'gargote', name: 'Gargote des étudiants' }],
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
      { i: 1, j: 1, lot: 0, kind: 'home', name: 'Ma chambre' }, { i: 3, j: 2, lot: 2, kind: 'gargote', name: 'Gargote Mame Diarra' },
      { i: 0, j: 2, lot: 1, kind: 'cafe', name: 'Café Touba · Parcelles' }, { i: 3, j: 1, lot: 3, kind: 'garage', name: 'Garage Modou' },
    ],
    spawnBlock: [1, 1],
  },
};

export const HUB_SPAWN_NOTE = 'spawn is on the sidewalk next to the station (or the home in Pikine)';

function disposeGroup(g: THREE.Object3D) {
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
  });
}

export function buildHub(id: HubId): HubWorld {
  const sp = SPECS[id];
  const R = rng(sp.seed);
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const plain = new Batch(), fac = new Batch(), lampPosts = new Batch(), lampBulbs = new Batch();
  const glass = new Batch(), water = new Batch();

  const tex = facadeTextures();
  const facadeMat = new THREE.MeshLambertMaterial({ map: tex.map, vertexColors: true, emissive: 0xffc880, emissiveMap: tex.glow, emissiveIntensity: 0 });
  const plainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x335577, emissiveIntensity: 0.25 });
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });

  const size = HALF * 2;
  // Ground, with the sea or beach on open sides.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ color: sp.ground }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; group.add(ground);

  const bounds = { x0: -HALF - 3, x1: HALF + 3, z0: -HALF - 3, z1: HALF + 3 };
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x2a8fbd, emissive: 0x0b3a55, emissiveIntensity: 0.4 });
  if (sp.sea === 'west') {
    plain.box(22, 0.3, size + 40, -HALF + 1, 0, 0, 0xd8c690);                      // beach / promenade edge
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 1400), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(-HALF - 360, 0.05, 0); group.add(sea);
    bounds.x0 = -HALF + 6;
    plain.box(1, 1, size, -HALF + 6.5, 0, 0, 0xcfc8b4);                              // sea wall
  }
  if (sp.sea === 'north') {
    plain.box(size + 40, 0.3, 40, 0, 0, -HALF - 16, 0xe9d9a8);                       // beach
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.05, -HALF - 20 - 350); group.add(sea);
    bounds.z0 = -HALF - 30;
  }

  // Roads, sidewalks, block slabs.
  const edges: RoadEdge[] = [];
  const nodes: { x: number; z: number }[][] = [];
  for (let k = 0; k <= NB; k++) {
    plain.box(ROAD, 0.08, size + 12, roadC(k), 0, 0, sp.road);      // roads along z (x = roadC(k))
    plain.box(size + 12, 0.08, ROAD, 0, 0, roadC(k), sp.road);      // roads along x
  }
  for (let a = 0; a <= NB; a++) { nodes[a] = []; for (let b = 0; b <= NB; b++) nodes[a][b] = { x: roadC(a), z: roadC(b) }; }
  for (let a = 0; a <= NB; a++) for (let b = 0; b <= NB; b++) {
    if (a < NB) edges.push({ ax: roadC(a), az: roadC(b), bx: roadC(a + 1), bz: roadC(b) });
    if (b < NB) edges.push({ ax: roadC(a), az: roadC(b), bx: roadC(a), bz: roadC(b + 1) });
  }
  for (let k = 0; k <= NB; k++) {
    for (let t = -HALF + 6; t < HALF - 4; t += 9) {
      plain.box(0.3, 0.02, 4, roadC(k), 0.08, t, 0xe8e4d8);          // dashes
      plain.box(4, 0.02, 0.3, t, 0.08, roadC(k), 0xe8e4d8);
    }
  }
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const bx = blockMin(i), bz = blockMin(j);
    plain.box(BLK + 6, 0.18, BLK + 6, bx + BLK / 2, 0, bz + BLK / 2, sp.walk);
    plain.box(BLK, 0.22, BLK, bx + BLK / 2, 0, bz + BLK / 2, sp.blockGround);
  }

  const lotRect = (i: number, j: number, a: number, b: number) => {
    const x0 = blockMin(i) + a * (LS + 2), z0 = blockMin(j) + b * (LS + 2);
    return { x0, z0, x1: x0 + LS, z1: z0 + LS, cx: x0 + LS / 2, cz: z0 + LS / 2 };
  };
  const solid = (x0: number, z0: number, x1: number, z1: number, h: number) => colliders.push({ x0, z0, x1, z1, h });
  const solidC = (cx: number, cz: number, w: number, d: number, h: number) => solid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h);

  const signs: THREE.Mesh[] = [];
  const addSign = (text: string, bg: string, fg: string, x: number, y: number, z: number, rotY: number, w = 6, h = 1.5) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }));
    m.position.set(x, y, z); m.rotation.y = rotY; group.add(m); signs.push(m);
  };
  const palm = (x: number, z: number, s = 1) => {
    const lean = (R() - 0.5) * 0.25;
    plain.cyl(0.22 * s, 0.34 * s, 6.2 * s, x, 0.2, z, 0x8a6b45, 6, [lean, 0, 0]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + R();
      plain.box(0.7 * s, 0.12 * s, 3.4 * s, x + Math.sin(a) * 1.5 * s, 6 * s, z + Math.cos(a) * 1.5 * s, k % 2 ? 0x2f8f4e : 0x3aa35c, a);
    }
  };
  const awning = (cx: number, cz: number, w: number, d: number, y: number, col: number) => {
    plain.box(w, 0.2, d, cx, y, cz, col);
    plain.box(w, 0.2, 0.3, cx, y - 0.4, cz + d / 2, 0xffffff);
  };

  // ------------------------------------------------------------ buildings per block
  const wall = (x0: number, z0: number, x1: number, z1: number, col: number, h = 1.4) => {
    plain.box(x1 - x0, h, 0.3, (x0 + x1) / 2, 0.2, z0, col); plain.box(x1 - x0, h, 0.3, (x0 + x1) / 2, 0.2, z1, col);
    plain.box(0.3, h, z1 - z0, x0, 0.2, (z0 + z1) / 2, col); plain.box(0.3, h, z1 - z0, x1, 0.2, (z0 + z1) / 2, col);
  };

  const buildLotBuilding = (i: number, j: number, a: number, b: number) => {
    const L = lotRect(i, j, a, b);
    if (sp.style === 'banlieue') {
      // Two small breeze-block houses with a painted wall and a courtyard.
      for (let k = 0; k < 2; k++) {
        const w = 8 + R() * 3, d = 8 + R() * 3, fl = 1 + (R() < 0.35 ? 1 : 0);
        const cx = L.cx + (k ? 5.5 : -5.5), cz = L.cz + (R() - 0.5) * 6, h = fl * 3 + 0.3;
        const col = pick(sp.palette, R);
        fac.facade(w, h, d, cx, 0.2, cz, col);
        plain.box(w + 0.4, 0.3, d + 0.4, cx, 0.2 + h, cz, 0x9a968c);          // roof slab
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plain.box(0.2, 1.1, 0.2, cx + sx * (w / 2 - 0.3), 0.2 + h + 0.3, cz + sz * (d / 2 - 0.3), 0x6b5a4a); // rebar stubs
        solidC(cx, cz, w, d, h);
      }
      wall(L.x0 + 0.5, L.z0 + 0.5, L.x1 - 0.5, L.z1 - 0.5, 0xc9b99a, 1.2);
      return;
    }
    if (sp.style === 'villa') {
      const w = 15 + R() * 3, d = 11 + R() * 2, fl = 2, h = fl * 3.2;
      fac.facade(w, h, d, L.cx, 0.2, L.cz + 3, pick(sp.palette, R));
      plain.box(w + 0.6, 0.3, d + 0.6, L.cx, 0.2 + h, L.cz + 3, 0xdadada);
      glass.box(w - 2, 1.6, 0.1, L.cx, 1.6, L.cz + 3 - d / 2 - 0.06, 0x2f5f86);
      plain.box(8, 0.12, 4.5, L.cx + 3, 0.2, L.cz - 6.5, 0x35a7d6);             // pool
      wall(L.x0 + 0.3, L.z0 + 0.3, L.x1 - 0.3, L.z1 - 0.3, 0xf0ece0, 1.8);
      solidC(L.cx, L.cz + 3, w, d, h);
      palm(L.x0 + 2.5, L.z0 + 2.5, 0.9); palm(L.x1 - 2.5, L.z0 + 3, 0.9);
      return;
    }
    const fl = sp.floors[0] + Math.floor(R() * (sp.floors[1] - sp.floors[0] + 1));
    const w = 15 + R() * 5, d = 15 + R() * 5, h = fl * 3.2;
    const col = pick(sp.palette, R);
    const cx = L.cx + (R() - 0.5) * 2, cz = L.cz + (R() - 0.5) * 2;
    fac.facade(w, h, d, cx, 0.2, cz, col);
    plain.box(w + 0.5, 0.35, d + 0.5, cx, 0.2 + h, cz, 0xd2cdc2);
    if (sp.style === 'dense') {
      plain.box(w, 0.3, 3, cx, 3.4, cz + d / 2 + 1.4, 0xb9ad98);                   // ground-floor arcade slab
      for (let k = -2; k <= 2; k++) plain.box(0.5, 3.2, 0.5, cx + k * (w / 4.4), 0.2, cz + d / 2 + 2.6, 0xe9e1cf);
      if (fl >= 5) plain.box(4, 2, 4, cx, 0.2 + h + 0.3, cz, 0x9aa3a8);             // roof plant
    } else {
      plain.box(w, 0.4, 2.2, cx, 3.3, cz + d / 2 + 1, 0x8fb7c9);                    // student block balcony strip
    }
    solidC(cx, cz, w + 0.5, d + 0.5, h);
  };

  const kioskAt = (k: KioskSpec) => {
    const L = lotRect(k.i, k.j, k.lot % 2, k.lot >> 1);
    const south = (k.lot >> 1) === 1;       // lot row b: 0 -> faces -z, 1 -> faces +z
    const dir = south ? 1 : -1;
    const w = 14, d = 8, h = 4.2;
    const cz = south ? L.z1 - d / 2 - 0.5 : L.z0 + d / 2 + 0.5, cx = L.cx;
    const col = k.kind === 'cafe' ? 0x6fa56a : k.kind === 'gargote' ? 0xe8a43c : k.kind === 'restaurant' ? 0xf3f0ea : k.kind === 'garage' ? 0x7f8a96 : 0xe7b45a;
    fac.facade(w, h, d, cx, 0.2, cz, col);
    plain.box(w + 0.4, 0.3, d + 0.4, cx, 0.2 + h, cz, 0xd2cdc2);
    awning(cx, cz + dir * (d / 2 + 1.2), w - 1, 2.6, 3.1, k.kind === 'cafe' ? 0x2f8f4e : 0xd9482b);
    plain.box(w - 3, 1, 0.8, cx, 0.2, cz + dir * (d / 2 + 0.6), 0x7a5a3c);            // counter
    solidC(cx, cz, w, d + 1.4, h);
    const fy = cz + dir * (d / 2 + 1.6);
    const bg = k.kind === 'cafe' ? '#14532d' : k.kind === 'gargote' ? '#7c2d12' : k.kind === 'restaurant' ? '#0c4a6e' : k.kind === 'garage' ? '#1f2937' : '#78350f';
    addSign(k.name.toUpperCase(), bg, '#fff7e0', cx, 5.6, fy, dir > 0 ? 0 : Math.PI, 8.5, 1.6);
    const px = cx, pz = south ? blockMin(k.j) + BLK + 1.5 : blockMin(k.j) - 1.5;
    interactables.push({ id: `${id}:${k.kind}:${k.i}${k.j}`, name: k.name, kind: 'actions', x: px, z: pz, radius: 4.4, actions: ACTIONS[k.kind] });
    return { px, pz, south, cx };
  };

  const specialAt = (i: number, j: number, kind: Special) => {
    const bx = blockMin(i), bz = blockMin(j), cx = bx + BLK / 2, cz = bz + BLK / 2;
    plain.box(BLK, 0.26, BLK, cx, 0, cz, kind === 'pitch' ? 0x5aa84f : kind === 'arena' || kind === 'ecurie' ? 0xd9bb8a : 0xd8d0bd);
    switch (kind) {
      case 'mosque': {
        fac.facade(26, 11, 22, cx, 0.2, cz + 2, 0xf6f3ea);
        plain.box(20, 1.2, 16, cx, 11.2, cz + 2, 0xe9e5d8);
        plain.sphere(7.5, cx, 12.4, cz + 2, 0x8fc7a8, true);
        for (const sx of [-1, 1]) { plain.box(3.2, 26, 3.2, cx + sx * 15, 0.2, cz - 8, 0xf6f3ea); plain.box(4, 1, 4, cx + sx * 15, 20, cz - 8, 0x3f8f6a); plain.cyl(0, 1.8, 4, cx + sx * 15, 26.2, cz - 8, 0x3f8f6a, 6); solidC(cx + sx * 15, cz - 8, 3.2, 3.2, 26); }
        plain.box(7, 6, 0.6, cx, 0.2, cz - 8.7, 0x2b4b45);                               // entrance arch
        solidC(cx, cz + 2, 26, 22, 11);
        addSign('GRANDE MOSQUÉE', '#0f3d33', '#f3ecd0', cx, 8.4, cz - 9.3, Math.PI, 9, 1.8);
        break;
      }
      case 'market': {
        const kits: Collider[] = [];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
          const sx = bx + 8 + c * 13, sz = bz + 7 + r * 9;
          const col = pick([0xd9482b, 0x2f8fd1, 0xe7b82f, 0x3aa35c, 0xc2417f], R);
          for (const dx of [-2.2, 2.2]) for (const dz of [-1.5, 1.5]) plain.box(0.15, 2.4, 0.15, sx + dx, 0.26, sz + dz, 0x6b5a4a);
          plain.box(5.4, 0.2, 3.8, sx, 2.6, sz, col);
          plain.box(4.4, 0.9, 2.4, sx, 0.26, sz, 0x8b6a47);
          plain.box(0.9, 0.5, 0.9, sx - 1, 1.16, sz, pick([0xe58a2f, 0xc4372b, 0x6aa84f], R));
          kits.push({ x0: sx - 2.2, z0: sz - 1.2, x1: sx + 2.2, z1: sz + 1.2, h: 1.2 });
        }
        colliders.push(...kits);
        addSign('MARCHÉ SANDAGA', '#7c2d12', '#ffe9b8', cx, 4.8, bz - 0.4, 0, 9, 1.8);
        interactables.push({ id: `${id}:market`, name: 'Étal de Sandaga', kind: 'actions', x: bx + 8 + 13, z: bz + 7 + 4.5, radius: 4, actions: ACTIONS.market });
        break;
      }
      case 'station': {
        plain.box(26, 0.2, 14, cx, 0.26, cz, 0xb7ad98);
        const cr = makeCarRapide(); cr.position.set(cx - 3, 0.3, cz); cr.rotation.y = Math.PI / 2; group.add(cr);
        plain.box(0.3, 4.5, 0.3, cx + 9, 0.26, cz - 5, 0x444444);
        addSign('GARE · TRAVEL', '#1e3a8a', '#fde68a', cx, 5.6, cz - 6.8, Math.PI, 8.5, 1.7);
        plain.box(12, 0.2, 3.5, cx + 6, 3.4, cz + 4, 0x1e3a8a);                           // shelter
        for (const dx of [0.2, 11.8]) plain.box(0.2, 3.2, 0.2, cx + dx, 0.26, cz + 4, 0x444444);
        plain.box(8, 0.5, 1, cx + 6, 0.26, cz + 4.6, 0x6b5a4a);                           // bench
        solidC(cx - 3, cz, 6.4, 2.6, 2.4);
        interactables.push({ id: `${id}:station`, name: 'Car rapide · changer de quartier', kind: 'travel', x: cx - 3, z: cz + 3.2, radius: 4.8, actions: [] });
        break;
      }
      case 'monument': {
        plain.cyl(22, 22, 2.5, cx, 0.26, cz, 0xa8b78a, 20);
        plain.box(12, 3, 12, cx, 2.7, cz, 0x7a746a);
        plain.box(8, 12, 8, cx, 5.7, cz, 0x8c867b);
        plain.box(5, 18, 3.5, cx, 17.7, cz, 0x6b7f6b);                                    // stylised figure (temp)
        plain.sphere(2.2, cx, 37, cz, 0x6b7f6b); plain.box(1.6, 8, 1.6, cx + 3.2, 28, cz, 0x6b7f6b, 0.4);
        solidC(cx, cz, 12, 12, 24);
        addSign('MONUMENT DE LA RENAISSANCE', '#14212b', '#d8e2dc', cx, 7.5, cz + 6.4, 0, 9.5, 1.8);
        break;
      }
      case 'gym': {
        plain.box(26, 0.1, 18, cx, 0.26, cz, 0x9b4f3c);
        for (let k = 0; k < 3; k++) { const gx = cx - 8 + k * 8; plain.box(0.25, 3.2, 0.25, gx - 1.6, 0.36, cz - 4, 0x2d3748); plain.box(0.25, 3.2, 0.25, gx + 1.6, 0.36, cz - 4, 0x2d3748); plain.box(3.6, 0.2, 0.2, gx, 3.4, cz - 4, 0xd9d9d9); solidC(gx, cz - 4, 3.8, 0.6, 3.5); }
        plain.box(6, 0.5, 1, cx, 0.36, cz + 5, 0x2f5f86);
        addSign('SALLE EN PLEIN AIR', '#1f2937', '#fde68a', cx, 5.2, cz - 8.8, Math.PI, 8, 1.5);
        interactables.push({ id: `${id}:gym`, name: 'Salle de sport en plein air', kind: 'actions', x: cx, z: cz + 2, radius: 6, actions: ACTIONS.gym });
        break;
      }
      case 'pitch': {
        const w = 40, d = 30;
        plain.box(w + 2, 0.05, 0.4, cx, 0.26, cz - d / 2, 0xffffff); plain.box(w + 2, 0.05, 0.4, cx, 0.26, cz + d / 2, 0xffffff);
        plain.box(0.4, 0.05, d, cx - w / 2, 0.26, cz, 0xffffff); plain.box(0.4, 0.05, d, cx + w / 2, 0.26, cz, 0xffffff); plain.box(0.4, 0.05, d, cx, 0.26, cz, 0xffffff);
        for (const sx of [-1, 1]) { plain.box(0.2, 2.4, 0.2, cx + sx * (w / 2), 0.3, cz - 3, 0xffffff); plain.box(0.2, 2.4, 0.2, cx + sx * (w / 2), 0.3, cz + 3, 0xffffff); plain.box(0.2, 0.2, 6, cx + sx * (w / 2), 2.6, cz, 0xffffff); }
        break;
      }
      case 'port': {
        plain.box(6, 0.4, 36, cx, 0.26, bz - 8, 0x8b6a47);                                 // pier toward the sea
        const cols = [0x1e6fd9, 0xe7b82f, 0xd9482b, 0x2f8f4e];
        for (let k = 0; k < 5; k++) {
          const bx2 = cx - 17 + k * 8, bz2 = bz - 16 - R() * 4;
          plain.box(2, 1.2, 8, bx2, 0.3, bz2, cols[k % 4]); plain.box(1.2, 1, 2.4, bx2, 0.3, bz2 - 4.8, cols[(k + 1) % 4]);
        }
        for (let k = 0; k < 3; k++) { plain.box(5, 0.3, 3, bx + 8 + k * 14, 2.4, cz + 6, 0x3b82f6); plain.box(4, 0.8, 2.4, bx + 8 + k * 14, 0.26, cz + 6, 0xdbeafe); }
        addSign('PORT DE PÊCHE · NGOR', '#0c4a6e', '#e0f2fe', cx, 5.4, bz + 1, 0, 9, 1.7);
        interactables.push({ id: `${id}:port`, name: 'Port de pêche', kind: 'actions', x: cx, z: bz + 4, radius: 5, actions: ACTIONS.port });
        break;
      }
      case 'arena': {
        plain.cyl(19, 19, 0.3, cx, 0.26, cz, 0xe8cf99, 24);
        const segs = 28;
        for (let s = 0; s < segs; s++) {
          if (s === segs / 2) continue;                                                     // entrance gate facing the street (-z)
          const a = (s / segs) * Math.PI * 2;
          plain.box(4.6, 8, 1.6, cx + Math.sin(a) * 21, 0.26, cz + Math.cos(a) * 21, s % 2 ? 0xe8e0d0 : 0xc9bb9c, a);
          solidC(cx + Math.sin(a) * 21, cz + Math.cos(a) * 21, 4.4, 4.4, 8);
          plain.box(0.15, 6, 0.15, cx + Math.sin(a) * 24, 0.26, cz + Math.cos(a) * 24, 0x555555);
          plain.box(1.8, 1.1, 0.05, cx + Math.sin(a) * 24, 5.2, cz + Math.cos(a) * 24, [0x1a9d54, 0xf4c20d, 0xd9322b][s % 3], a);
        }
        addSign('ARÈNE · LÀMB', '#3b1d0b', '#ffd98a', cx, 9.6, cz - 19.5, Math.PI, 8, 1.6);
        interactables.push({ id: `${id}:arena`, name: 'Arène · làmb', kind: 'actions', x: cx, z: cz - 24, radius: 5, actions: ACTIONS.arena });
        arenaInfo = { cx, cz, r: 19 };
        break;
      }
      case 'ecurie': {
        const w = 18, d = 14;
        fac.facade(w, 6, d, cx, 0.26, cz + 6, 0xe0ad5a);
        plain.box(w + 0.4, 0.3, d + 0.4, cx, 6.26, cz + 6, 0xc9bb9c);
        plain.box(w - 2, 0.25, 4, cx, 4.2, cz - 2.2, 0x2f8f4e);
        plain.box(16, 0.1, 10, cx, 0.26, cz - 8, 0x8c6a40);
        solidC(cx, cz + 6, w, d, 6);
        addSign('ÉCURIE · ENTRAÎNEMENT', '#3b1d0b', '#ffd98a', cx, 7.5, cz - 1.2, Math.PI, 9, 1.6);
        interactables.push({ id: `${id}:ecurie`, name: 'Écurie Baobab', kind: 'actions', x: cx, z: cz - 6, radius: 5, actions: ACTIONS.ecurie });
        ecurieInfo = { cx, cz: cz - 8 };
        break;
      }
      default: break;
    }
  };

  // Populate the grid.
  const kioskLots = new Map<string, KioskSpec>();
  for (const k of sp.kiosks) kioskLots.set(`${k.i},${k.j},${k.lot}`, k);
  let spawn = { x: 0, z: 0, yaw: 0 };
  let arenaInfo: HubWorld['arena'] = null, ecurieInfo: HubWorld['ecurie'] = null;
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const key = `${i},${j}`;
    const s = sp.specials[key];
    if (s) { specialAt(i, j, s); continue; }
    for (let lot = 0; lot < 4; lot++) {
      const k = kioskLots.get(`${i},${j},${lot}`);
      if (k) {
        const info = kioskAt(k);
        if (k.kind === 'home') {
          // Face the home at an angle: the camera stays on the street side and the first view shows the neighbourhood.
          spawn = { x: info.cx, z: info.pz, yaw: (info.south ? Math.PI : 0) + 0.95 };
        }
        // Fill the rest of this lot's footprint behind the kiosk with a small yard wall.
        continue;
      }
      buildLotBuilding(i, j, lot % 2, lot >> 1);
    }
  }
  const [si, sj] = sp.spawnBlock;
  if (id !== 'pikine') {
    const sx = blockMin(si) + BLK / 2, sz = blockMin(sj) + BLK / 2;
    spawn = { x: sx - 3, z: sz + 7, yaw: Math.PI };
    if (id === 'almadies') spawn = { x: sx - 3, z: sz + 7, yaw: Math.PI };
  }

  // Lamp posts and palms along roads.
  for (let k = 0; k <= NB; k++) {
    for (let t = -HALF + 14; t < HALF - 8; t += 30) {
      for (const s of [-1, 1]) {
        const off = s * (ROAD / 2 + 1);
        const pts: [number, number][] = [[roadC(k) + off, t + (s > 0 ? 8 : 0)], [t + (s > 0 ? 8 : 0), roadC(k) + off]];
        for (const [x, z] of pts) {
          lampPosts.box(0.22, 6, 0.22, x, 0, z, 0x3d4047);
          lampBulbs.box(0.7, 0.35, 0.7, x, 6, z, 0xffe2a0);
        }
      }
    }
  }
  let placed = 0;
  while (placed < sp.palms) {
    const k = Math.floor(R() * (NB + 1)), t = -HALF + 10 + R() * (size - 20), off = (R() < 0.5 ? -1 : 1) * (ROAD / 2 + 2.4);
    const alongX = R() < 0.5;
    const x = alongX ? t : roadC(k) + off, z = alongX ? roadC(k) + off : t;
    if (sp.sea === 'west' && x < -HALF + 8) continue;
    palm(x, z, 0.9 + R() * 0.4); placed++;
  }
  if (sp.sea === 'west') for (let z = -HALF + 14; z < HALF - 8; z += 16) palm(-HALF + 3, z, 1.1);
  if (sp.sea === 'north') for (let x = -HALF + 10; x < HALF - 6; x += 18) palm(x, -HALF - 3, 1.1);

  for (const [b, m, shadow] of [[plain, plainMat, true], [fac, facadeMat, true], [lampPosts, plainMat, true], [lampBulbs, lampMat, false], [glass, glassMat, false], [water, plainMat, false]] as [Batch, THREE.Material, boolean][]) {
    const mesh = b.build(m, true, shadow); if (mesh) group.add(mesh);
  }

  return {
    id, group, colliders, interactables, bounds, spawn, edges, nodes, lamps: lampMat, facadeMat,
    skyDay: 0, arena: arenaInfo, ecurie: ecurieInfo,
    dispose() { disposeGroup(group); },
  };
}
