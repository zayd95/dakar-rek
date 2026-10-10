import * as THREE from 'three';
import { Batch, signTexture } from './batch';
import { addGrain } from './grain';
import { floorTileTexture, plasterTexture, metalTexture, generatedTexture } from './textures';
import { ACTIONS, onSeat } from './content';
import { furnitureById } from '../economy/furniture';
import type { Collider, Interactable } from './types';
import { benchSeats, type Seat } from '../interact/seats';

/**
 * Walkable interiors, built off the street grid (x ≥ 1000) and entered through a door action.
 * The interior is not the same footprint as the street building (a common game shortcut, noted in FEATURES.md).
 * Ceiling is a downward-facing plane: seen from inside, culled if the camera ever rises above it.
 * Furniture and layout are PROVISIONAL (to review with Habib); no brand names, no real places.
 * The starter room ('home') also draws the furniture the player bought (`owned`, src/economy/furniture.ts) and adds
 * its actions; main.ts rebuilds the room after a purchase.
 */
export type InteriorKind = 'home' | 'gargote' | 'maiga';

export interface Interior {
  kind: InteriorKind;
  name: string;
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** Chairs and benches (space filled in by main.ts with the door's space key). */
  seats: Seat[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** Where the camera may go (just inside the walls). */
  cameraBox: { x0: number; x1: number; z0: number; z1: number };
  spawn: { x: number; z: number; yaw: number };
  light: THREE.Vector3;
  /** Light colour: warm bulb at home, cool tube in the gargote. */
  lightColor: number;
}

const H = 2.9; // ceiling height

let mats: Record<string, THREE.Material> | null = null;
function materials() {
  if (mats) return mats;
  const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  mats = {
    floor: addGrain(lam(), 0.3, 1, false, floorTileTexture(), 1.32),
    // gargote floor: Higgsfield texture #15, beige and terracotta tiles, 4 × 4 tiles of 30 cm per repeat
    floorGargote: addGrain(lam(), 0.2, 1, false, generatedTexture('floor_tiles_terracotta'), 1.2),
    wall: addGrain(lam(), 0.4, 1, false, plasterTexture(), 2),
    // wood: Higgsfield texture #19 (planks v2, seam-fixed), desaturated, 1 m per repeat
    wood: addGrain(lam(), 0.2, 1, false, generatedTexture('wood'), 1),
    metal: addGrain(lam(), 0.3, 1, false, metalTexture(), 1),
    plain: addGrain(lam(), 0.5, 2),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    /** Daylight seen between the shutters; main.ts darkens it at night. */
    sky: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}

/** Generic wax-style print for bed sheets and tablecloths (own design). */
function waxTexture(a: string, b: string, c: string) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = a; g.fillRect(0, 0, 64, 64);
  g.fillStyle = b; for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 64; x += 16) { g.beginPath(); g.arc(x + 4, y + 8, 5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = c; for (let y = 4; y < 64; y += 16) for (let x = (y / 16) % 2 ? 0 : 8; x < 64; x += 16) g.fillRect(x + 2, y + 2, 4, 4);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/** Colour of the daylight between the window shutters (shared by all interiors). */
export function setInteriorDaylight(c: THREE.Color) { (materials().sky as THREE.MeshBasicMaterial).color.copy(c); }

export function buildInterior(kind: InteriorKind, ox: number, oz: number, name: string, hub: string, owned: readonly string[] = []): Interior {
  const M = materials();
  const group = new THREE.Group();
  const floor = new Batch(), wall = new Batch(), wood = new Batch(), metal = new Batch(), plain = new Batch(), glow = new Batch(), sky = new Batch();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const seats: Seat[] = [];
  const W = kind === 'home' ? 6 : kind === 'maiga' ? 3.8 : 10, D = kind === 'home' ? 4.8 : kind === 'maiga' ? 7 : 7.5;
  const x0 = ox - W / 2, x1 = ox + W / 2, z0 = oz - D / 2, z1 = oz + D / 2;
  const solid = (cx: number, cz: number, w: number, d: number, h = 1.2) => colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, h });
  const signs: THREE.Mesh[] = [];

  // shell: tiled floor, two-tone painted walls with skirting, door in the south wall (+z)
  // Maïga (Habib, 7 Oct: a gargote, smaller and dirtier; Higgsfield reference #18): peeling blue-green walls, worn tiles
  const lower = kind === 'home' ? 0x8fc3d9 : kind === 'maiga' ? 0x3f7f86 : 0x7fb07a, upper = kind === 'home' ? 0xf3efe6 : kind === 'maiga' ? 0x8eaaa0 : 0xf2e2a8;
  floor.box(W, 0.1, D, ox, 0, oz, kind === 'home' ? 0xf2f0ec : kind === 'maiga' ? 0xa89f90 : 0xffffff);
  const side = (w: number, d: number, x: number, z: number) => {
    wall.box(w, 1.2, d, x, 0.1, z, lower); wall.box(w, H - 1.2, d, x, 1.3, z, upper);
    plain.box(w + (d > w ? 0.02 : 0), 0.04, d + (w > d ? 0.02 : 0), x, 1.28, z, 0x5f7f8f);   // dado line
  };
  const doorX = ox + W / 2 - 1.3;
  side(W, 0.2, ox, z0 - 0.1);                                                                // north
  side(0.2, D, x0 - 0.1, oz); side(0.2, D, x1 + 0.1, oz);                                     // west, east
  side(doorX - 0.6 - x0, 0.2, (x0 + doorX - 0.6) / 2, z1 + 0.1);                              // south, left of door
  side(x1 - doorX - 0.6, 0.2, (doorX + 0.6 + x1) / 2, z1 + 0.1);
  wall.box(1.2, H - 2.2, 0.2, doorX, 2.3, z1 + 0.1, upper);
  metal.box(1.2, 2.2, 0.06, doorX, 0.1, z1 + 0.18, kind === 'home' ? 0x1e6fd9 : 0x2f8f4e);   // closed metal door (painted)
  plain.box(0.1, 0.06, 0.1, doorX - 0.45, 1.1, z1 + 0.12, 0xd4b24a);
  colliders.push({ x0: x0 - 1, z0: z0 - 1, x1: x1 + 1, z1: z0, h: H }, { x0: x0 - 1, z0, x1: x0, z1: z1 + 1, h: H }, { x0: x1, z0, x1: x1 + 1, z1: z1 + 1, h: H }, { x0: x0 - 1, z0: z1, x1: x1 + 1, z1: z1 + 1, h: H });
  // ceiling (faces down only)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.4, D + 0.4), addGrain(new THREE.MeshLambertMaterial({ color: 0xf4f1ea, emissive: 0x2a2824 }), 0.4, 2));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(ox, H + 0.1, oz); group.add(ceil);
  plain.box(W, 0.12, 0.08, ox, 0.1, z0 + 0.04, 0x8a7a6a); plain.box(0.08, 0.12, D, x0 + 0.04, 0.1, oz, 0x8a7a6a); plain.box(0.08, 0.12, D, x1 - 0.04, 0.1, oz, 0x8a7a6a); // skirting
  // window with blue louvred metal shutters on the north wall, daylight behind
  const win = (x: number, z: number) => {
    sky.box(1.2, 1.1, 0.02, x, 1.3, z + 0.01, 0xffffff);
    for (let k = 0; k < 7; k++) metal.box(1.2, 0.07, 0.12, x, 1.35 + k * 0.15, z + 0.06, 0x2f6fb3);
    wood.box(1.4, 0.06, 0.18, x, 1.24, z + 0.08, 0xd9cbb3);
    plain.box(0.5, 1.5, 0.04, x - 0.75, 1.0, z + 0.15, kind === 'home' ? 0xc2417f : 0xe7b82f); // curtain
  };
  if (kind !== 'maiga') win(ox - W / 4, z0); if (kind === 'gargote') win(ox + W / 4, z0);
  // ceiling light: bulb at home, fluorescent tube in the gargote
  if (kind !== 'gargote') { plain.cyl(0.02, 0.02, 0.3, ox, H - 0.2, oz, 0x222222, 4); glow.sphere(0.07, ox, H - 0.25, oz, 0xfff1c8); }
  else { plain.box(1.3, 0.06, 0.12, ox, H - 0.08, oz, 0xdddddd); glow.box(1.2, 0.05, 0.06, ox, H - 0.13, oz, 0xeaf6ff); }
  // ceiling fan (the Maïga has a small wall fan instead)
  if (kind !== 'maiga') {
  const fanX = kind === 'home' ? ox + 1.2 : ox - 2, fanZ = kind === 'home' ? oz : oz + 1;
  plain.cyl(0.03, 0.03, 0.4, fanX, H - 0.3, fanZ, 0x333333, 4); plain.cyl(0.12, 0.12, 0.1, fanX, H - 0.38, fanZ, 0xe8e8e8, 8);
  for (let k = 0; k < 3; k++) plain.box(0.14, 0.015, 0.8, fanX + Math.sin(k * 2.094) * 0.42, H - 0.36, fanZ + Math.cos(k * 2.094) * 0.42, 0xe8e8e8, k * 2.094);
  }

  /** Monobloc plastic chair facing `rot` (its back is behind the sitter); `table` = where the plate goes. Returns the seat id. */
  const chair = (x: number, z: number, rot: number, col = 0xf2f2ee, table?: Seat['table']) => {
    const id = `${hub}:${kind}:chair:${seats.length}`;
    seats.push({ id, x: x + Math.sin(rot) * 0.04, z: z + Math.cos(rot) * 0.04, top: 0.53, yaw: rot, kind: 'chair', space: '', occupant: null, table });
    const c = Math.cos(rot), s = Math.sin(rot);
    plain.box(0.46, 0.05, 0.44, x, 0.48, z, col, rot);
    for (const [dx, dz] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) plain.box(0.04, 0.46, 0.04, x + dx * c + dz * s, 0.05, z - dx * s + dz * c, col);
    plain.box(0.46, 0.42, 0.04, x - 0.2 * s, 0.53, z - 0.2 * c, col, rot);
    solid(x, z, 0.5, 0.5, 0.9);
    return id;
  };

  if (kind === 'home') {
    // bed: wooden frame, foam mattress with a wax print sheet, pillow (a thicker mattress and two pillows once bought)
    const has = (id: string) => owned.includes(id);
    const bx = x0 + 1.1, bz = oz - 0.6, good = has('matelas'), mh = good ? 0.34 : 0.22;
    wood.box(1.5, 0.35, 2.05, bx, 0.1, bz, 0x8b5a32); wood.box(1.5, 0.75, 0.08, bx, 0.1, bz - 1.02, 0x7a4c28);
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(1.4, mh, 1.95), new THREE.MeshLambertMaterial({ map: good ? waxTexture('#1f5aa8', '#f4c20d', '#f2f2ec') : waxTexture('#c2417f', '#f4c20d', '#1a9d54') }));
    sheet.position.set(bx, 0.45 + mh / 2, bz + 0.03); sheet.castShadow = true; group.add(sheet);
    if (good) { plain.box(0.6, 0.15, 0.35, bx - 0.35, 0.45 + mh, bz - 0.75, 0xf2f2ec); plain.box(0.6, 0.15, 0.35, bx + 0.35, 0.45 + mh, bz - 0.75, 0xf4e6c8); }
    else plain.box(0.9, 0.14, 0.35, bx, 0.67, bz - 0.75, 0xf2f2ec);
    solid(bx, bz, 1.6, 2.1, 0.7);
    // lying on the bed: feet at the foot end, head on the pillow (seat yaw 0 = the feet point to +z)
    const bed = `${hub}:home:bed`;
    const sleep = good ? furnitureById('matelas')!.action : ACTIONS.home.find(a => a.id === 'dormir')!;
    interactables.push({ id: `${hub}:in:bed`, name: good ? 'Lit · bon matelas' : 'Lit', kind: 'actions', x: bx + 1.05, z: bz, radius: 1.4, actions: [onSeat(sleep, bed, 'sleep')] });
    seats.push({ id: bed, x: bx, z: bz + 0.9, top: 0.45 + mh, yaw: 0, kind: 'bed', space: '', occupant: null });
    // wardrobe with mirror
    wood.box(1.2, 2.0, 0.55, x1 - 0.7, 0.1, z0 + 0.4, 0x6e4426); plain.box(0.4, 1.2, 0.02, x1 - 0.95, 0.6, z0 + 0.68, 0xbcd0dc); plain.box(0.02, 1.8, 0.02, x1 - 0.7, 0.2, z0 + 0.68, 0x4a2e18);
    solid(x1 - 0.7, z0 + 0.4, 1.2, 0.6, 2);
    // small table (with the TV once bought, else a thermos and a cup), a chair facing it, a standing fan
    wood.box(1.0, 0.7, 0.5, x1 - 0.6, 0.1, oz + 0.7, 0x8b6a47);
    const tableChair = chair(x1 - 1.6, oz + 0.9, Math.PI / 2 + 0.3);
    if (has('tele')) {   // watched from the chair
      plain.box(0.3, 0.44, 0.68, x1 - 0.55, 0.8, oz + 0.7, 0x1d1d1f);
      // the screen faces the room (−x); its own mesh so the programme can change colour while the player watches
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), new THREE.MeshBasicMaterial({ color: 0x3b5f8a }));
      screen.name = 'tv-screen'; screen.rotation.y = -Math.PI / 2; screen.position.set(x1 - 0.711, 1.02, oz + 0.7); group.add(screen);
      interactables.push({ id: `${hub}:in:tele`, name: 'Petite télé', kind: 'actions', x: x1 - 1.5, z: oz + 0.1, radius: 1.1, actions: [onSeat(furnitureById('tele')!.action, tableChair)] });
    } else { plain.cyl(0.07, 0.07, 0.3, x1 - 0.4, 0.8, oz + 0.75, 0xd9322b, 8); plain.cyl(0.05, 0.04, 0.08, x1 - 0.75, 0.8, oz + 0.65, 0xf2f2ec, 8); }
    solid(x1 - 0.6, oz + 0.7, 1.0, 0.6, 1);
    plain.cyl(0.18, 0.2, 0.05, x0 + 0.5, 0.1, z1 - 0.5, 0x333333, 10); plain.cyl(0.02, 0.02, 1.1, x0 + 0.5, 0.15, z1 - 0.5, 0x333333, 4); plain.cyl(0.24, 0.24, 0.1, x0 + 0.5, 1.25, z1 - 0.45, 0xe8e8e8, 10, [Math.PI / 2, 0, 0]);
    // prayer mat, suitcase, ataya set on a small charcoal stove, plastic kettle and bucket for washing
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 1.2), new THREE.MeshLambertMaterial({ map: waxTexture('#1f5a3a', '#d4b24a', '#7a1f3d') }));
    mat.position.set(ox + 0.2, 0.11, oz - 1.4); group.add(mat);
    plain.box(0.7, 0.45, 0.25, x0 + 0.5, 0.1, z0 + 0.3, 0x2f4f86);
    metal.cyl(0.14, 0.11, 0.18, ox - 0.6, 0.1, z1 - 0.6, 0x555555, 10); metal.cyl(0.08, 0.1, 0.16, ox - 0.6, 0.28, z1 - 0.6, 0x9aa0a6, 8);
    for (let k = 0; k < 3; k++) plain.cyl(0.025, 0.02, 0.06, ox - 0.25 + k * 0.07, 0.1, z1 - 0.55, 0xe8f4ff, 6);
    plain.cyl(0.14, 0.12, 0.32, x0 + 1.4, 0.1, z1 - 0.45, 0x2a8fd1, 10); plain.cyl(0.1, 0.12, 0.2, x0 + 1.75, 0.1, z1 - 0.4, 0x1a9d54, 8);
    interactables.push({ id: `${hub}:in:wash`, name: 'Seau et bouilloire', kind: 'actions', x: x0 + 1.55, z: z1 - 1.0, radius: 1.2, actions: ACTIONS.home.filter(a => a.id === 'laver') });
    // framed photos and a calendar (images left blank on purpose: no real people)
    for (const [x, c] of [[ox - 0.4, 0x7a5a3c], [ox + 0.4, 0x3d4a5c]] as const) { wood.box(0.45, 0.55, 0.03, x, 1.6, z0 + 0.02, c); plain.box(0.35, 0.45, 0.01, x, 1.65, z0 + 0.05, 0xd9d2c4); }
    plain.box(0.4, 0.55, 0.01, x0 + 0.02, 1.5, oz + 0.8, 0xf4f1e8, Math.PI / 2);

    // Bought furniture (Lot B). Doors, the door path and the camera stay free: everything sits against a wall or flat on the floor.
    if (has('radio')) {   // low shelf by the north wall with a small radio (no real station, no sound for now)
      wood.box(0.6, 0.5, 0.3, ox - 0.9, 0.1, z0 + 0.2, 0x7a5a3c);
      plain.box(0.36, 0.2, 0.14, ox - 0.9, 0.6, z0 + 0.22, 0x2b2b33); plain.cyl(0.06, 0.06, 0.01, ox - 0.98, 0.7, z0 + 0.3, 0x9aa0a6, 10, [Math.PI / 2, 0, 0]);
      plain.box(0.07, 0.03, 0.02, ox - 0.8, 0.74, z0 + 0.3, 0xf4c20d); plain.cyl(0.006, 0.006, 0.35, ox - 0.76, 0.8, z0 + 0.18, 0xbbbbbb, 4, [0, 0, -0.5]);
      solid(ox - 0.9, z0 + 0.2, 0.6, 0.3, 0.7);
      interactables.push({ id: `${hub}:in:radio`, name: 'Petite radio', kind: 'actions', x: ox - 0.9, z: oz - 1.6, radius: 1.0, actions: [furnitureById('radio')!.action] });
    }
    if (has('miroir')) {  // tall mirror with a wooden frame on the east wall
      wood.box(0.04, 1.4, 0.65, x1 - 0.03, 0.55, oz - 0.7, 0x6e4426); plain.box(0.02, 1.25, 0.52, x1 - 0.06, 0.62, oz - 0.7, 0xc8dce6);
      interactables.push({ id: `${hub}:in:miroir`, name: 'Grand miroir', kind: 'actions', x: x1 - 0.7, z: oz - 0.7, radius: 1.0, actions: [furnitureById('miroir')!.action] });
    }
    if (has('tapis')) {   // flat rug in the middle of the room (no collider)
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshLambertMaterial({ map: waxTexture('#b5452b', '#f2d16b', '#2a5b8f') }));
      rug.rotation.x = -Math.PI / 2; rug.position.set(ox - 0.1, 0.108, oz + 0.7); rug.receiveShadow = true; group.add(rug);
      interactables.push({ id: `${hub}:in:tapis`, name: 'Tapis', kind: 'actions', x: ox - 0.1, z: oz + 0.7, radius: 0.9, actions: [furnitureById('tapis')!.action] });
    }
    if (has('chaises')) { // two monobloc chairs for guests along the west wall
      chair(x0 + 0.45, oz + 0.8, Math.PI / 2, 0x2a8fd1); chair(x0 + 0.45, oz + 1.38, Math.PI / 2, 0xf2f2ee);
      interactables.push({ id: `${hub}:in:chaises`, name: 'Chaises pour les invités', kind: 'actions', x: x0 + 1.0, z: oz + 0.75, radius: 0.8,
        actions: [onSeat(furnitureById('chaises')!.action, { near: { x: x0 + 0.45, z: oz + 1.1 }, r: 0.6, kind: 'chair' })] });
    }
  } else if (kind === 'maiga') {
    // one narrow room: a worn wooden counter with dented pots on gas rings along one wall, a long table with oilcloth and a
    // bench along the other, mismatched plastic chairs, a wall fan, peeling paint and soot (decals), a bare bulb
    const cx = x0 + 0.55;
    wood.box(0.9, 0.95, 3.2, cx, 0.1, oz - 1.4, 0x8a6a48);
    for (let k = 0; k < 3; k++) {
      const pz = oz - 2.6 + k * 1.15;
      metal.box(0.5, 0.12, 0.5, cx, 1.05, pz, 0x333333);                                       // gas ring
      metal.cyl(0.26 - k * 0.03, 0.24 - k * 0.03, 0.42 - k * 0.06, cx + (k % 2 ? 0.05 : -0.04), 1.17, pz, 0x9da2a6, 10);   // dented aluminium pots
    }
    metal.cyl(0.16, 0.16, 0.55, cx, 0.1, oz + 0.5, 0x2a6fb3, 10);                                 // butane bottle
    colliders.push({ x0: x0, z0: oz - 3.1, x1: cx + 0.5, z1: oz + 0.25, h: 1.2 });
    interactables.push({ id: `${hub}:in:counter`, name, kind: 'actions', x: cx + 1.1, z: oz - 1.4, radius: 1.5, actions: ACTIONS.maiga });
    const tx = x1 - 0.5;
    const cloth = new THREE.MeshLambertMaterial({ map: waxTexture('#efe2c8', '#c2417f', '#4f8a3c') });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 3.6), cloth); top.position.set(tx, 0.84, oz - 0.3); group.add(top);
    for (const dz of [-1.6, 1.0]) wood.box(0.7, 0.72, 0.06, tx, 0.1, oz - 0.3 + dz, 0x6b4a2e);
    wood.box(0.35, 0.45, 3.2, tx - 0.75, 0.1, oz - 0.3, 0x7a5a3c);                                 // bench
    seats.push(...benchSeats(`${hub}:${kind}:bench`, tx - 0.75, oz - 0.3, Math.PI / 2, 0.55, '', 3.2, 3).map(b => ({ ...b, table: { x: tx - 0.22, y: 0.86, z: b.z } })));
    colliders.push({ x0: tx - 0.95, z0: oz - 2.2, x1: x1, z1: oz + 1.6, h: 0.9 });
    chair(tx - 0.2, oz + 2.0, Math.PI, 0xf2f2ee, { x: tx - 0.2, y: 0.86, z: oz + 1.3 }); chair(x0 + 0.8, oz + 1.6, Math.PI / 2 + 0.4, 0x2a6fb3);
    // wall fan, soot on the ceiling and walls, peeling patches
    plain.box(0.1, 0.25, 0.1, x1 - 0.06, 2.3, oz - 2.8, 0x333333); plain.cyl(0.22, 0.22, 0.08, x1 - 0.2, 2.4, oz - 2.8, 0xd8d8d8, 10, [0, 0, Math.PI / 2]);
    for (let k = 0; k < 9; k++) {
      const side = k % 2 ? x0 + 0.01 : x1 - 0.01, z = oz - 3 + k * 0.75, y = 0.6 + ((k * 37) % 17) / 10;
      plain.box(0.02, 0.3 + (k % 3) * 0.15, 0.35 + (k % 2) * 0.3, side, y, z, k % 3 ? 0xc9c4b4 : 0x5a6a62);   // peeled plaster / stains
    }
    plain.box(W - 0.2, 0.02, 1.6, ox, H + 0.08, oz - 2.2, 0x3a3630);                              // soot above the stove
    plain.box(0.02, 0.9, 2.6, x0 + 0.01, 1.9, oz - 1.6, 0x4a4842);
  } else {
    // counter with large cooking pots, a basin and the menu board
    const cz = z0 + 1.3;
    wood.box(W - 3, 1.0, 0.7, ox - 0.5, 0.1, cz, 0x7a5a3c); plain.box(W - 2.9, 0.05, 0.8, ox - 0.5, 1.1, cz, 0xd9d2c4);
    for (let k = 0; k < 3; k++) { metal.cyl(0.32, 0.28, 0.45, ox - 3 + k * 1.1, 1.15, cz, 0xb8bcc0, 12); plain.cyl(0.3, 0.3, 0.02, ox - 3 + k * 1.1, 1.58, cz, [0xd98b3a, 0xe8c070, 0x8a4a1f][k], 12); }
    metal.cyl(0.4, 0.35, 0.18, ox + 1.2, 1.15, cz, 0x9aa0a6, 12);
    solid(ox - 0.5, cz, W - 3, 0.8, 1.1);
    interactables.push({ id: `${hub}:in:counter`, name, kind: 'actions', x: ox - 0.5, z: cz + 1.1, radius: 1.8, actions: ACTIONS.gargote });
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.0), new THREE.MeshLambertMaterial({ map: signTexture('CEEBU JËN · YASSA · MAFÉ', '#1f2a24', '#f6efd8', 512, 128) }));
    menu.position.set(ox - 0.5, 2.1, z0 + 0.02); group.add(menu); signs.push(menu);
    // fridge with a lit glass door, water filter
    plain.box(0.8, 1.9, 0.7, x1 - 0.6, 0.1, z0 + 0.5, 0xf2f2ee); glow.box(0.6, 1.3, 0.01, x1 - 0.6, 0.6, z0 + 0.86, 0xd8ecf4);
    for (let k = 0; k < 4; k++) plain.box(0.5, 0.2, 0.05, x1 - 0.6, 0.7 + k * 0.3, z0 + 0.84, [0xd9322b, 0x6b3fa0, 0xf4c20d, 0x1a9d54][k]);
    solid(x1 - 0.6, z0 + 0.5, 0.8, 0.7, 2);
    // tables with oilcloth, monobloc chairs
    const cloth = new THREE.MeshLambertMaterial({ map: waxTexture('#f4f1e8', '#d9322b', '#2f6fb3') });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const tx = x0 + 1.8 + c * 2.9, tz = oz + 0.6 + r * 2.0;
      if (c === 2 && r === 1) continue;                                                     // keep the path to the door clear
      plain.box(0.06, 0.72, 0.06, tx, 0.1, tz, 0x555555);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.8), cloth); top.position.set(tx, 0.84, tz); top.castShadow = true; group.add(top);
      solid(tx, tz, 1.2, 0.8, 0.9);
      // one chair on each side, both facing the table (yaw = the way the sitter looks)
      chair(tx - 0.85, tz, Math.PI / 2, c % 2 ? 0x2a8fd1 : 0xf2f2ee, { x: tx - 0.25, y: 0.89, z: tz });     // served on the plate laid there
      chair(tx + 0.85, tz, -Math.PI / 2, c % 2 ? 0x2a8fd1 : 0xf2f2ee, { x: tx + 0.3, y: 0.86, z: tz - 0.15 });
      plain.cyl(0.12, 0.12, 0.03, tx - 0.25, 0.86, tz, 0xf4f1e8, 10); plain.cyl(0.04, 0.04, 0.15, tx + 0.3, 0.86, tz + 0.1, 0x6fbf6a, 6);
    }
    // TV on a wall bracket, posters
    plain.box(0.9, 0.55, 0.08, x0 + 0.06, 2.0, oz, 0x1d1d1f, Math.PI / 2); glow.box(0.8, 0.46, 0.01, x0 + 0.11, 2.0, oz, 0x2f5f86, Math.PI / 2);
    for (const [z, c] of [[oz - 2, 0xd9482b], [oz + 2, 0x1e6fd9]] as const) plain.box(0.6, 0.8, 0.01, x1 - 0.01, 1.5, z, c, Math.PI / 2);
  }

  for (const [b, m, cast] of [[floor, kind === 'gargote' ? M.floorGargote : M.floor, false], [wall, M.wall, false], [wood, M.wood, true], [metal, M.metal, true], [plain, M.plain, true], [glow, M.glow, false], [sky, M.sky, false]] as [Batch, THREE.Material, boolean][]) {
    const mesh = b.build(m, true, cast); if (mesh) group.add(mesh);
  }
  interactables.push({ id: `${hub}:in:door`, name: 'Sortir', kind: 'actions', x: doorX, z: z1 - 0.6, radius: 1.2, actions: [{ id: 'sortir', label: 'Sortir', seconds: 0, special: 'exit' }] });
  return {
    kind, name, group, colliders, interactables, seats,
    bounds: { x0: x0 + 0.3, x1: x1 - 0.3, z0: z0 + 0.3, z1: z1 - 0.3 },
    cameraBox: { x0: x0 + 0.15, x1: x1 - 0.15, z0: z0 + 0.15, z1: z1 - 0.15 },
    spawn: { x: doorX - 0.6, z: oz - D * 0.06, yaw: Math.PI + 0.35 },
    light: new THREE.Vector3(ox, H - 0.35, oz), lightColor: kind === 'gargote' ? 0xe8f2ff : 0xffd9a0,
  };
}

/** Free a rebuilt interior (geometry, its own materials and textures; shared materials stay). */
export function disposeInterior(int: Interior) {
  int.group.traverse(o => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.MeshLambertMaterial[];
    for (const x of mats) if (!x.userData.shared) { x.map?.dispose(); x.dispose(); }
  });
}
