import * as THREE from 'three';
import { Batch } from '../world/batch';
import { addGrain } from '../world/grain';
import { floorTileTexture, plasterTexture, generatedTexture } from '../world/textures';
import type { Interior } from '../world/interiors';
import type { Collider, Interactable } from '../world/types';
import type { HomeLevel, HomeSpec } from './catalog';
import { openPlan } from './placement';

/**
 * Interiors of the homes above the starter room (apartment, house, villa, luxury residence): one open room in the plan of
 * `openPlan` (src/economy/placement.ts) — kitchen counter along the west wall, shower corner in the north-east, door in
 * the south wall — finished according to the level (walls, floor, windows, height). Empty: the player furnishes it.
 * Built off the street grid like every interior and entered through the home's street door (src/economy/estate.ts).
 */
interface Finish { lower: number; upper: number; h: number; door: number; trim: number; glass: boolean; kitchen: number; top: number }
const FINISH: Record<Exclude<HomeLevel, 'room'>, Finish> = {
  apartment: { lower: 0xd9c7a8, upper: 0xf3efe6, h: 2.9, door: 0x1e6fd9, trim: 0x8a7a6a, glass: false, kitchen: 0x8b6a47, top: 0xd9d2c4 },
  house: { lower: 0x9fc2a0, upper: 0xf6f1e7, h: 3.1, door: 0x2f8f4e, trim: 0x6e5a44, glass: false, kitchen: 0x6e4426, top: 0xe8e2d6 },
  villa: { lower: 0xeee9df, upper: 0xf7f5f0, h: 3.3, door: 0x6e4426, trim: 0xc9bfae, glass: true, kitchen: 0xf2f0ec, top: 0x2b2b2e },
  residence: { lower: 0xe6dfd2, upper: 0xfaf8f3, h: 3.4, door: 0x3a2416, trim: 0xc9a14a, glass: true, kitchen: 0x2b2b2e, top: 0xf1efe9 },
};

let mats: Record<string, THREE.Material> | null = null;
function materials() {
  if (mats) return mats;
  const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  mats = {
    tiles: addGrain(lam(), 0.3, 1, false, floorTileTexture(), 1.32),
    wood: addGrain(lam(), 0.2, 1, false, generatedTexture('wood'), 1),
    marble: addGrain(lam(), 0.15, 1, false, generatedTexture('terrazzo'), 1.5),
    wall: addGrain(lam(), 0.4, 1, false, plasterTexture(), 2),
    plain: addGrain(lam(), 0.5, 2),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    sky: new THREE.MeshBasicMaterial({ color: 0xbfe3f5 }),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}

export interface HomeInterior { int: Interior; spots: { kitchen: { x: number; z: number }; shower: { x: number; z: number } }; ceiling: THREE.Object3D[] }

/** `upgrades`: the home's upgrades that show in the shell (« peinture »: freshly painted walls). */
export function buildHomeInterior(h: HomeSpec, ox: number, oz: number, hub: string, upgrades: readonly string[] = []): HomeInterior {
  const level = h.home.level === 'room' ? 'apartment' : h.home.level;
  const base = FINISH[level], M = materials(), L = openPlan(level, h.home.w, h.home.d);
  const F = upgrades.includes('peinture') ? { ...base, lower: 0x7fb7c9, upper: 0xfbf3e2, trim: 0x2f6f86 } : base;
  const W = L.w, D = L.d, H = F.h;
  const x0 = ox - W / 2, x1 = ox + W / 2, z0 = oz - D / 2, z1 = oz + D / 2;
  const group = new THREE.Group();
  const floor = new Batch(), wall = new Batch(), plain = new Batch(), glow = new Batch(), sky = new Batch();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const ceiling: THREE.Object3D[] = [];

  // floor and walls (two-tone with a dado line), door in the south wall
  floor.box(W, 0.1, D, ox, 0, oz, h.home.floor === 'marble' ? 0xf4f1ea : h.home.floor === 'wood' ? 0xb07a4a : 0xf2f0ec);
  const side = (w: number, d: number, x: number, z: number) => {
    wall.box(w, 1.2, d, x, 0.1, z, F.lower); wall.box(w, H - 1.2, d, x, 1.3, z, F.upper);
    plain.box(w + (d > w ? 0.02 : 0), 0.04, d + (w > d ? 0.02 : 0), x, 1.28, z, F.trim);
  };
  const doorX = ox + L.doorX;
  side(W, 0.2, ox, z0 - 0.1); side(0.2, D, x0 - 0.1, oz); side(0.2, D, x1 + 0.1, oz);
  side(doorX - 0.6 - x0, 0.2, (x0 + doorX - 0.6) / 2, z1 + 0.1); side(x1 - doorX - 0.6, 0.2, (doorX + 0.6 + x1) / 2, z1 + 0.1);
  wall.box(1.2, H - 2.2, 0.2, doorX, 2.3, z1 + 0.1, F.upper);
  plain.box(1.2, 2.2, 0.06, doorX, 0.1, z1 + 0.18, F.door); plain.box(0.1, 0.06, 0.1, doorX - 0.45, 1.1, z1 + 0.12, 0xd4b24a);
  colliders.push({ x0: x0 - 1, z0: z0 - 1, x1: x1 + 1, z1: z0, h: H }, { x0: x0 - 1, z0, x1: x0, z1: z1 + 1, h: H }, { x0: x1, z0, x1: x1 + 1, z1: z1 + 1, h: H }, { x0: x0 - 1, z0: z1, x1: x1 + 1, z1: z1 + 1, h: H });
  plain.box(W, 0.12, 0.08, ox, 0.1, z0 + 0.04, F.trim); plain.box(0.08, 0.12, D, x0 + 0.04, 0.1, oz, F.trim); plain.box(0.08, 0.12, D, x1 - 0.04, 0.1, oz, F.trim);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.4, D + 0.4), addGrain(new THREE.MeshLambertMaterial({ color: 0xf4f1ea, emissive: 0x2a2824 }), 0.4, 2));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(ox, H + 0.1, oz); group.add(ceil);

  // windows on the north wall: louvred shutters, or tall glass for the villa and the residence (daylight behind)
  const nWin = Math.max(1, Math.floor((W - 3) / 3));
  for (let k = 0; k < nWin; k++) {
    const x = ox - W / 2 + 1.2 + (k + 0.5) * ((W - 3.6) / nWin);
    if (F.glass) {
      sky.box(2.2, H - 0.9, 0.02, x, 0.5, z0 + 0.01, 0xffffff);
      for (const dx of [-1.1, 0, 1.1]) plain.box(0.06, H - 0.9, 0.08, x + dx, 0.5, z0 + 0.04, F.trim);
      plain.box(2.3, 0.08, 0.1, x, H - 0.4, z0 + 0.05, F.trim);
    } else {
      sky.box(1.2, 1.1, 0.02, x, 1.3, z0 + 0.01, 0xffffff);
      for (let s = 0; s < 7; s++) plain.box(1.2, 0.07, 0.12, x, 1.35 + s * 0.15, z0 + 0.06, 0x2f6fb3);
      plain.box(1.4, 0.06, 0.18, x, 1.24, z0 + 0.08, 0xd9cbb3);
      plain.box(0.5, 1.5, 0.04, x - 0.75, 1.0, z0 + 0.15, level === 'house' ? 0x1a9d54 : 0xc2417f);
    }
  }
  // lights: a ceiling fixture per 4 m (the room's point light is at the centre)
  const fixtures = new Batch();
  for (let fx = -1; fx <= 1; fx++) for (let fz = -1; fz <= 1; fz++) {
    if (Math.abs(fx) * 4.5 > W / 2 || Math.abs(fz) * 3.5 > D / 2) continue;
    fixtures.cyl(0.22, 0.22, 0.05, ox + fx * 4.5, H - 0.05, oz + fz * 3.5, 0xfff1d0, 12);
  }

  // kitchen counter (west wall, north end): stove, sink, a fridge at the end
  const kz = -D / 2 + Math.min(2.6, D * 0.36), kx = x0 + 0.3, kLen = kz + D / 2;
  plain.box(0.6, 0.88, kLen - 0.7, kx, 0.1, oz - D / 2 + (kLen - 0.7) / 2 + 0.7, F.kitchen);
  plain.box(0.64, 0.04, kLen - 0.7, kx, 0.98, oz - D / 2 + (kLen - 0.7) / 2 + 0.7, F.top);
  plain.box(0.66, 1.8, 0.66, kx, 0.1, z0 + 0.35, 0xeeeeee); glow.box(0.02, 0.5, 0.02, kx + 0.34, 1.0, z0 + 0.6, 0xd8ecf4);   // fridge
  for (let r = 0; r < 2; r++) plain.cyl(0.11, 0.11, 0.02, kx + 0.05, 1.02, oz + kz - 0.45 - r * 0.35, 0x222222, 12);
  plain.box(0.4, 0.06, 0.5, kx + 0.02, 0.97, oz - D / 2 + 1.2, 0xb8bcc0);                                    // sink
  plain.cyl(0.02, 0.02, 0.3, kx - 0.18, 1.0, oz - D / 2 + 1.2, 0x9aa0a6, 6);
  colliders.push({ x0, z0, x1: x0 + 0.6, z1: oz + kz, h: 1.2 });
  // shower corner (north-east): tiles, a tray, the shower head and a curtain
  const sx0 = x1 - 1.2, sz1 = z0 + 1.2;
  plain.box(1.2, 0.04, 1.2, sx0 + 0.6, 0.1, z0 + 0.6, 0xbfd9e6);
  plain.box(1.2, 2.0, 0.02, sx0 + 0.6, 0.1, z0 + 0.01, 0xcfe4ee); plain.box(0.02, 2.0, 1.2, x1 - 0.01, 0.1, z0 + 0.6, 0xcfe4ee);
  plain.cyl(0.02, 0.02, 0.5, x1 - 0.2, 1.9, z0 + 0.2, 0x9aa0a6, 6); plain.cyl(0.1, 0.06, 0.05, x1 - 0.3, 2.05, z0 + 0.3, 0xb8bcc0, 10);
  plain.box(0.02, 1.9, 1.2, sx0, 0.3, z0 + 0.6, level === 'apartment' ? 0xf4c20d : 0xe8e8e8); plain.box(0.7, 1.9, 0.02, sx0 + 0.35, 0.3, sz1, level === 'apartment' ? 0xf4c20d : 0xe8e8e8);
  colliders.push({ x0: sx0, z0, x1, z1: sz1, h: 2 });
  // a little life on the walls: framed pictures (blank on purpose: no real people) and a clock
  for (const [x, c] of [[ox - 0.6, 0x7a5a3c], [ox + 0.6, 0x3d4a5c]] as const) { plain.box(0.6, 0.45, 0.03, x, 1.7, z1 - 0.02, c); plain.box(0.5, 0.35, 0.01, x, 1.75, z1 - 0.04, 0xd9d2c4); }
  plain.cyl(0.18, 0.18, 0.03, x0 + 0.02, 2.0, oz + 1.2, 0xf2f2ec, 16, [0, 0, Math.PI / 2]);

  const floorMat = h.home.floor === 'marble' ? M.marble : h.home.floor === 'wood' ? M.wood : M.tiles;
  for (const [b, m, cast] of [[floor, floorMat, false], [wall, M.wall, false], [plain, M.plain, true], [glow, M.glow, false], [sky, M.sky, false]] as [Batch, THREE.Material, boolean][]) {
    const mesh = b.build(m, true, cast); if (mesh) group.add(mesh);
  }
  const fx = fixtures.build(M.glow, false, false); if (fx) { group.add(fx); ceiling.push(fx); }
  interactables.push({ id: `${hub}:in:door:${h.id}`, name: 'Sortir', kind: 'actions', x: doorX, z: z1 - 0.6, radius: 1.2, actions: [{ id: 'sortir', label: 'Sortir', seconds: 0, special: 'exit' }] });
  const int: Interior = {
    kind: 'home', name: h.name, group, colliders, interactables, seats: [],
    bounds: { x0: x0 + 0.3, x1: x1 - 0.3, z0: z0 + 0.3, z1: z1 - 0.3 },
    cameraBox: { x0: x0 + 0.15, x1: x1 - 0.15, z0: z0 + 0.15, z1: z1 - 0.15 },
    spawn: { x: doorX - 0.6, z: z1 - 1.3, yaw: Math.PI + 0.35 },
    light: new THREE.Vector3(ox, H - 0.35, oz), lightColor: 0xffd9a0,
  };
  return { int, spots: { kitchen: { x: x0 + 1.05, z: oz - D / 2 + kLen / 2 + 0.2 }, shower: { x: x1 - 0.6, z: sz1 + 0.5 } }, ceiling };
}
