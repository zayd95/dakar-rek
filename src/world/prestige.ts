import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityContext } from './city';
import { say } from '../i18n/wolof';

/**
 * « Prestige Auto » (fictional): the premium dealership of the Almadies, a reserved parcel of its own on the plaza's road: the whole block (0, 2) of
 * the district's grid belongs to it (src/world/city.ts `CITY_BLOCKS`, so no villa, wall, tree or lamp is generated there), the road to its south.
 *
 *     z = 53   ┌──────────────────────────────── back yard (empty, trees) ───────────────┐
 *     z = 33   ├─────────────────────────────────────────────────────────────────────────┤  back wall
 *              │ desk ▪        floor (terrazzo)        ▫ ▫ ▫ ▫  the four cars, nose south │
 *              │ ▒ motos (display only)                                                   │
 *     z = 17   ├──glass──┤door├─glass──┤────── 18 m vehicle bay, open ──────┤──glass──────┤  street front
 *              │            forecourt (paved, 10 m deep: the cars turn here)              │
 *     z =  7   └─────────────────────── pavement, then the road (z = 0) ─────────────────┘
 *              x = −113                                                               x = −67
 *
 * Everything the vehicle code and the salesperson need to agree on lives here, in hub-local metres, so the building and the people in it cannot drift apart.
 */
export const PRESTIGE_HUB = 'almadies' as const;
export const PRESTIGE_BLOCK = '0,2';
/** The reserved block (hub-local). */
export const PARCEL = { x0: -113, x1: -67, z0: 7, z1: 53 } as const;
/** The showroom building: front (street) line z0, back wall z1, side walls x0 / x1, roof height h. */
export const HALL = { x0: -109, x1: -69, z0: 17, z1: 33, h: 4.8 } as const;
/** Street front, from the west: glass, the entrance (a walkable gap), glass, the vehicle bay (open), glass. */
export const FRONT = { door: [-103, -99.4], bay: [-95.5, -77.5] } as const;
/** The four cars on the floor, nose to the street (yaw π): two saloons, then two SUVs, 4.3 m apart, each with a straight way out through the bay. */
export const SLOTS: readonly { x: number; z: number; yaw: number; model: 'berline' | 'suv' }[] = [
  { x: -92.6, z: 23, yaw: Math.PI, model: 'berline' }, { x: -88.3, z: 23, yaw: Math.PI, model: 'berline' },
  { x: -84.0, z: 23, yaw: Math.PI, model: 'suv' }, { x: -79.7, z: 23, yaw: Math.PI, model: 'suv' },
];
/** Jakarta motorbikes on a plinth by the west glass: for show only (they are sold at Garage Modou, Pikine). */
export const MOTO_PLINTH = { x0: -108.6, x1: -104, z0: 19, z1: 23.2 } as const;
export const MOTO_SPOTS: readonly { x: number; z: number; yaw: number }[] = [-107.4, -106.3, -105.2].map(x => ({ x, z: 21.1, yaw: Math.PI }));
/** The salesperson's desk (west end of the back wall), where he stands behind it, and where a customer stands in front of it (the catalogue's counter). */
export const DESK = { x: -103, z: 30.2, w: 3.2, d: 0.9 } as const;
export const SALES_HOME = { x: -103, z: 31.6 } as const;
export const COUNTER = { x: -103, z: 28.6 } as const;
/** The delivery spot for a car bought elsewhere (the phone): on the forecourt, clear of the bay's way out. */
export const FORECOURT_PARK = { x: -73.4, z: 12.2, yaw: Math.PI / 2 } as const;

/** Is (x, z) inside the dealership's grounds (the block, a little beyond its front for the pavement)? */
export const inGrounds = (x: number, z: number, pad = 0) => x > PARCEL.x0 - pad && x < PARCEL.x1 + pad && z > PARCEL.z0 - 4 - pad && z < PARCEL.z1 + pad;

const INK = 0x17181c, GOLD = 0xc9a227, STONE = 0xe9e5dc, GRAPHITE = 0x2a2c31, MULLION = 0x1f2024;

/** Builds the block: forecourt, hall (glass front, stone sides and back, roof and canopy), desk, motorbike plinth, pylon, signs, trees. */
export function buildPrestige(c: CityContext) {
  const { plain: b, pave, floor } = c;
  // real glass: one merged, see-through mesh for every pane of the hall (the hub's own glass batch is opaque and casts nothing); the panes cast no shadow, so the sun reaches the floor
  const panes: THREE.BufferGeometry[] = [];
  const pane = (w: number, hh: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, hh, d); g.translate(x, y + hh / 2, z); panes.push(g); };
  const solid = (x0: number, x1: number, z0: number, z1: number, h: number) => c.colliders.push({ x0, x1, z0, z1, h });
  const { x0, x1, z0, z1, h } = HALL;
  const T = 0.25;
  const FL = 0.12;

  // ground: the block's own slab is the hub's; the forecourt is paved in graphite with a gold line at the pavement, the hall floor is light terrazzo
  pave.box(PARCEL.x1 - PARCEL.x0, 0.04, z0 - PARCEL.z0, (PARCEL.x0 + PARCEL.x1) / 2, 0.07, (PARCEL.z0 + z0) / 2, GRAPHITE);
  pave.box(PARCEL.x1 - PARCEL.x0, 0.045, 0.25, (PARCEL.x0 + PARCEL.x1) / 2, 0.075, PARCEL.z0 + 0.4, GOLD);
  floor.box(x1 - x0, 0.03, z1 - z0, (x0 + x1) / 2, 0.105, (z0 + z1) / 2, 0xf3efe6);

  // roof: a glass roof on a steel grid (the sun reaches the cars), a solid canopy over the bay and the forecourt in front of it
  pane(x1 - x0, 0.06, z1 - z0, (x0 + x1) / 2, h + 0.05, (z0 + z1) / 2);
  for (let x = x0; x <= x1 + 0.01; x += 5) b.box(0.18, 0.28, z1 - z0 + 0.3, x, h - 0.05, (z0 + z1) / 2, INK);
  for (const z of [z0, (z0 + z1) / 2, z1]) b.box(x1 - x0 + 0.4, 0.28, 0.2, (x0 + x1) / 2, h - 0.05, z, INK);
  b.slab(FRONT.bay[1] - FRONT.bay[0] + 3, 0.22, 3.2, (FRONT.bay[0] + FRONT.bay[1]) / 2, h - 0.35, z0 - 1.5, INK);
  b.slab(FRONT.bay[1] - FRONT.bay[0] + 3, 0.05, 3.2, (FRONT.bay[0] + FRONT.bay[1]) / 2, h - 0.46, z0 - 1.5, GOLD);   // the gold underside line

  // street front: glass panes between mullions, the doorway, the bay's lintel
  const segs: [number, number][] = [[x0, FRONT.door[0]], [FRONT.door[1], FRONT.bay[0]], [FRONT.bay[1], x1]];
  const glassH = h - 0.5, sill = 0.1;
  for (const [a, e] of segs) {
    pane(e - a, glassH - 0.3, 0.05, (a + e) / 2, sill + 0.3, z0);
    b.box(e - a, 0.3, T, (a + e) / 2, sill, z0, MULLION);                                       // base rail
    const n = Math.max(1, Math.round((e - a) / 2.3));
    for (let k = 0; k <= n; k++) b.box(0.1, glassH, 0.14, a + ((e - a) * k) / n, sill, z0, MULLION);
    solid(a - 0.05, e + 0.05, z0 - 0.12, z0 + 0.12, h);
  }
  b.box(FRONT.bay[1] - FRONT.bay[0], h - glassH - sill + 0.05, T, (FRONT.bay[0] + FRONT.bay[1]) / 2, sill + glassH, z0, INK);             // lintel of the bay
  b.box(FRONT.door[1] - FRONT.door[0] + 0.2, h - glassH - sill + 0.05, T, (FRONT.door[0] + FRONT.door[1]) / 2, sill + glassH, z0, INK);    // lintel of the doorway
  for (const e of [FRONT.bay[0], FRONT.bay[1]]) b.box(0.3, h, 0.3, e, 0, z0, INK);                                                         // the bay's posts
  b.box(x1 - x0, h - glassH - sill + 0.05, T, (x0 + x1) / 2, sill + glassH, z0, INK);                                                       // the band the fascia sits on
  // sides and back: stone with a charcoal plinth
  b.box(T, h, z1 - z0, x0, 0, (z0 + z1) / 2, STONE); solid(x0 - T / 2, x0 + T / 2, z0, z1, h);
  b.box(T, h, z1 - z0, x1, 0, (z0 + z1) / 2, STONE); solid(x1 - T / 2, x1 + T / 2, z0, z1, h);
  b.box(x1 - x0 + T, h, T, (x0 + x1) / 2, 0, z1, STONE); solid(x0, x1, z1 - T / 2, z1 + T / 2, h);
  b.box(x1 - x0 + T, 0.5, T + 0.04, (x0 + x1) / 2, 0, z1, GRAPHITE);
  // the doorway reads as a doorway: two gold jambs
  for (const e of FRONT.door) b.box(0.1, glassH, 0.2, e, sill, z0, GOLD);

  // the salesperson's desk at the back (west), with a screen and a board of keys on the wall behind
  b.box(DESK.w, 0.95, DESK.d, DESK.x, FL, DESK.z, 0x2a2c31); b.box(DESK.w + 0.1, 0.05, DESK.d + 0.1, DESK.x, FL + 0.95, DESK.z, GOLD);
  b.box(0.5, 0.32, 0.04, DESK.x + 0.6, FL + 1.0, DESK.z, 0x101114);
  solid(DESK.x - DESK.w / 2, DESK.x + DESK.w / 2, DESK.z - DESK.d / 2, DESK.z + DESK.d / 2, 1.1);
  b.box(2.4, 1.1, 0.06, DESK.x, 1.3, z1 - 0.2, 0x2f2412);
  for (let k = 0; k < 6; k++) b.box(0.04, 0.12, 0.03, DESK.x - 0.9 + k * 0.36, 1.6, z1 - 0.24, GOLD);
  // two armchairs and a low table by the front-west glass: a corner to wait in
  b.box(1.1, 0.4, 0.5, -99.6, FL, 26.8, 0x3a3d44); b.box(1.1, 0.4, 0.5, -102, FL, 26.8, 0x3a3d44); b.box(0.9, 0.35, 0.9, -100.8, FL, 25.2, 0x3a3d44);
  solid(-102.7, -99, 26.5, 27.1, 0.8); solid(-101.3, -100.3, 24.7, 25.7, 0.5);

  // the motorbike plinth (display only): a low gold-edged platform with a plaque
  const pw = MOTO_PLINTH.x1 - MOTO_PLINTH.x0, pd = MOTO_PLINTH.z1 - MOTO_PLINTH.z0, px = (MOTO_PLINTH.x0 + MOTO_PLINTH.x1) / 2, pz = (MOTO_PLINTH.z0 + MOTO_PLINTH.z1) / 2;
  b.box(pw, 0.12, pd, px, FL + 0.02, pz, GRAPHITE); b.box(pw + 0.1, 0.03, pd + 0.1, px, FL + 0.14, pz, GOLD);
  c.sign('JAKARTA · en vente à Pikine', '#17181c', '#f4efe2', px, 1.15, MOTO_PLINTH.z1 - 0.2, 0, pw - 0.4, 0.5);
  solid(MOTO_PLINTH.x0, MOTO_PLINTH.x1, MOTO_PLINTH.z0, MOTO_PLINTH.z1, 1.1);

  // signs: the fascia over the glass facing the street, the pylon on the forecourt, a line on the back wall inside
  c.sign('PRESTIGE AUTO', '#16171b', '#e9c85a', (x0 + x1) / 2 - 8, h - 0.25, z0 - 0.17, Math.PI, 17, 1.7);
  c.sign(`BERLINES · 4 × 4 · ${say('Dalal ak jàmm')}`, '#16171b', '#f4efe2', (x0 + x1) / 2 + 12, h - 0.25, z0 - 0.17, Math.PI, 13, 1.2);
  c.sign('PRESTIGE AUTO · ALMADIES', '#16171b', '#e9c85a', -86.5, 3.6, z1 - 0.2, Math.PI, 9, 0.9);
  b.box(0.35, 7, 0.35, -70.6, 0, 9.4, INK); solid(-70.8, -70.4, 9.2, 9.6, 7);
  c.sign('PRESTIGE', '#16171b', '#e9c85a', -70.6, 6.1, 9.2, Math.PI, 3.4, 1.1);
  c.sign('PRESTIGE', '#16171b', '#e9c85a', -70.6, 6.1, 9.6, 0, 3.4, 1.1);
  b.box(0.4, 0.3, 0.4, -70.6, 6.9, 9.4, GOLD);

  // the back yard: empty, a few trees and a low wall
  b.box(PARCEL.x1 - PARCEL.x0 - 6, 1.1, 0.25, (PARCEL.x0 + PARCEL.x1) / 2, 0, PARCEL.z1 - 0.8, STONE); solid(PARCEL.x0 + 3, PARCEL.x1 - 3, PARCEL.z1 - 0.93, PARCEL.z1 - 0.68, 1.1);
  for (const x of [-100, -90, -80]) c.tree(x, 45, 1.3);
  c.tree(-111, 12, 1.1); c.tree(-68.5, 28, 1.1);
  c.pool(-86.5, 24, 16); c.pool(-86.5, 12, 14);

  if (panes.length) {
    const m = new THREE.Mesh(mergeGeometries(panes, false)!, new THREE.MeshLambertMaterial({ color: 0xc4dceb, transparent: true, opacity: 0.26, depthWrite: false, emissive: 0x1d2c3a, emissiveIntensity: 0.3 }));
    m.name = 'prestige_glass'; m.renderOrder = 2; m.castShadow = false; m.receiveShadow = false;
    c.add?.(m);
    for (const g of panes) g.dispose();
  }
}
