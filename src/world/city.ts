import * as THREE from 'three';
import type { HubId } from '../core/types';
import type { PersonLook } from '../actors/humanoid';
import type { Batch } from './batch';
import type { Action, Collider, HubWorld, Interactable } from './types';
import { CITY_ACTIONS as A } from './cityContent';
import { benchSeats, type Seat } from '../interact/seats';

export type CityBlock = 'soumbedioune' | 'mall' | 'bank' | 'square' | 'shops';
/** Compact, stylised geography within the existing four hubs. Never displaces an existing landmark. */
export const CITY_BLOCKS: Record<HubId, Record<string, CityBlock>> = {
  corniche: { '0,3': 'soumbedioune', '2,3': 'square' },
  plateau: { '3,1': 'bank', '1,3': 'square', '3,3': 'shops' },
  almadies: { '2,2': 'mall', '3,2': 'square' },
  pikine: { '0,1': 'bank', '0,3': 'shops', '1,3': 'square' },
};
export const BAY = { z0: 64, z1: 116, shoreX: -155, railX: -133.55 };

export interface CityContext {
  hub: HubId; lite: boolean;
  plain: Batch; glass: Batch; pave: Batch;
  /** Terrazzo floors (Higgsfield texture #28): bank hall and mall courtyard. */
  floor: Batch;
  people: HubWorld['people']; interactables: Interactable[]; colliders: Collider[];
  /** Street seats (src/interact/seats.ts): every bench built here can be sat on. */
  seats: Seat[];
  sign(text: string, bg: string, fg: string, x: number, y: number, z: number, yaw: number, w?: number, h?: number): void;
  tree(x: number, z: number, size?: number, flower?: boolean): void;
  pool(x: number, z: number, radius: number, y?: number): void;
}

/** Terrazzo floors sit just above the block ground slab (top at 0.13 m), so they neither z-fight with it nor hide under it. */
const TERRAZZO_Y = 0.135, TERRAZZO = 0xe6dfd2;
const FLOOR = 0.12, WHITE = 0xf2e9d6, WOOD = 0x8c6542, DARK = 0x253d43;
const FISHER: PersonLook = { skin: 0x633a24, style: 'tee', top: 0x236da0, bottom: 0x31404d, hat: 'kufi', hatColor: 0xf4c443, shoes: 0x242b27, muscular: 0.4 };
const VENDOR: PersonLook = { skin: 0x78452b, style: 'dress', top: 0xd66532, bottom: 0xd66532, female: true, pattern: 'wax', accent: 0xeee1b0, hat: 'headwrap', hatColor: 0xe8b734 };

export function buildCityBlock(c: CityContext, kind: CityBlock, cx: number, cz: number) {
  const { plain: b, pave, glass, lite } = c;
  const solid = (x: number, z: number, w: number, d: number, h = 3) => c.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
  const box = (w: number, h: number, d: number, x: number, z: number, color: number, y = FLOOR) => b.box(w, h, d, x, y, z, color);
  const sign = (name: string, x: number, z: number, color = '#214e52', y = 3.1, w = 6, yaw = 0) => c.sign(name, color, '#fff2d3', x, y, z, yaw, w, 0.8);
  const place = (key: string, name: string, x: number, z: number, actions: Action[], description: string, radius = 3) => {
    c.interactables.push({ id: `${c.hub}:city:${key}`, name, x, z, radius, kind: 'actions', actions, description });
  };
  let personCount = 0;
  const person = (x: number, z: number, yaw: number, clip: 'Idle' | 'Talk' | 'Sit' = 'Talk', look?: PersonLook, walkTo?: { x: number; z: number }) => {
    // Keep the landmarks inhabited at Low while reducing the optional crowd.
    if (lite && personCount++ % 2 === 1) return;
    c.people.push({ x, z, yaw, clip, look, walkTo });
  };
  const bench = (x: number, z: number, yaw = 0) => {
    c.seats.push(...benchSeats(`${c.hub}:bench:${c.seats.length}`, x, z, yaw, 0.58, 'street'));
    b.box(3.2, 0.12, 0.65, x, 0.46, z, WOOD, yaw);
    for (const side of [-1, 1]) b.box(0.16, 0.4, 0.6, x + Math.cos(yaw) * side * 1.25, FLOOR, z - Math.sin(yaw) * side * 1.25, DARK, yaw);
    b.box(3.2, 0.5, 0.1, x - Math.sin(yaw) * 0.32, 0.55, z - Math.cos(yaw) * 0.32, WOOD, yaw);
    solid(x, z, Math.abs(Math.cos(yaw)) * 3.2 + Math.abs(Math.sin(yaw)) * 0.7, Math.abs(Math.sin(yaw)) * 3.2 + Math.abs(Math.cos(yaw)) * 0.7, 0.7);
  };
  const table = (x: number, z: number, w = 2.8, color = WOOD) => {
    box(w, 0.09, 1.2, x, z, color, 0.9);
    for (const dx of [-w / 2 + 0.12, w / 2 - 0.12]) for (const dz of [-0.45, 0.45]) box(0.12, 0.8, 0.12, x + dx, z + dz, DARK);
    solid(x, z, w, 1.2, 1);
  };
  const shade = (x: number, z: number, w: number, d: number, color: number) => {
    b.slab(w, 0.15, d, x, 3.25, z, color);
    for (const dx of [-w / 2 + 0.2, w / 2 - 0.2]) for (const dz of [-d / 2 + 0.2, d / 2 - 0.2]) { box(0.12, 3.1, 0.12, x + dx, z + dz, DARK); solid(x + dx, z + dz, 0.18, 0.18); }
  };
  // Open-front shop: back/side walls, real counter, wide doorway, no full solid box across the entrance.
  const shop = (name: string, x: number, z: number, color: number, w = 10) => {
    const d = 8, h = 3.8;
    pave.box(w, 0.04, d + 2, x, 0.07, z + 0.5, WHITE);
    for (const dx of [-w / 2, w / 2]) { box(0.25, h, d, x + dx, z, color); solid(x + dx, z, 0.25, d, h); }
    box(w, h, 0.25, x, z - d / 2, color); solid(x, z - d / 2, w, 0.25, h);
    b.slab(w + 0.4, 0.2, d + 0.5, x, h + FLOOR, z, WHITE);
    box(w, 0.7, 0.25, x, z + d / 2, color, 3.2);
    // A partial counter leaves an aisle all the way to the shelves.
    table(x - w * 0.23, z + 1.3, w * 0.4, WHITE);
    box(w - 1, 0.1, 0.9, x, z - 3, WOOD, 1.2);
    box(w - 1, 0.1, 0.9, x, z - 3, WOOD, 2.2);
    solid(x, z - 3, w - 1, 1, 2.5);
    sign(name.toUpperCase(), x, z + 4.15, '#275256', 3.58, w - 0.5);
    c.pool(x, z + 2, 4.5);
  };
  const goods = (x: number, z: number, mode: 'cloth' | 'tech' | 'home' | 'food') => {
    const cols = [0xd34c3c, 0xe9be43, 0x3e8d87, 0x566aba, 0xe8decb];
    for (let k = 0; k < (lite ? 4 : 8); k++) {
      const xx = x - 3.2 + (k % 4) * 1.65, y = k < 4 ? 1.32 : 2.32;
      if (mode === 'cloth') b.cyl(0.24, 0.24, 0.6, xx, y, z - 3, cols[k % 5], 8, [0, 0, Math.PI / 2]);
      else if (mode === 'tech') { box(0.55, 0.62, 0.08, xx, z - 3, DARK, y); glass.box(0.44, 0.46, 0.04, xx, y + 0.06, z - 2.94, 0x4c98ba); }
      else if (mode === 'home') b.cyl(0.32, 0.18, 0.42, xx, y, z - 3, cols[k % 5], 8);
      else box(0.45, 0.6, 0.4, xx, z - 3, cols[k % 5], y);
    }
  };

  if (kind === 'soumbedioune') {
    // The beach extends out of the western city grid. Existing Corniche crossings lead to it.
    b.flat(42, 50, -140, 0.045, cz, 0xe1c28b);
    pave.box(5.5, 0.03, 46, cx - 20, 0.075, cz, 0xd9ceb0);
    sign('SOUMBÉDIOUNE', cx + 1, cz + 21, '#235b70', 4.0, 14);
    for (const dx of [-7, 9]) box(0.18, 3.6, 0.18, cx + dx, cz + 21, DARK);
    place('soumbedioune', 'Soumbédioune · débarquement', -138, cz + 6, A.landing, 'Nanga def ! Les pirogues sont rentrées. Viens donner un coup de main.', 3.6);
    for (let k = 0; k < (lite ? 4 : 7); k++) {
      const x = -147 + (k % 2) * 6, z = cz - 18 + k * 5.5;
      pirogue(b, x, z, 9 + k % 3, (k % 2 ? 0.12 : -0.2), k);
      // The collider encloses the rotated hull, not the open beach around it.
      solid(x, z, 3.6, 11.5, 1.1);
    }
    shade(-137, cz - 17, 6, 5, 0xb88445);
    // A suspended fishing net and floats; never described as a playable fishing simulator.
    for (let k = 0; k < (lite ? 5 : 10); k++) {
      box(0.025, 1.8, 0.025, -139.5 + k * 0.5, cz - 19, 0xb7c1a5, 0.65);
      box(5, 0.02, 0.02, -137, cz - 19, 0xb7c1a5, 0.7 + k * 0.16);
      b.sphere(0.08, -139.5 + k * 0.5, 2.5, cz - 19, k % 2 ? 0xe9bc37 : 0xd54e2d);
    }
    for (let k = 0; k < 4; k++) { box(0.9, 0.6, 0.65, -135.5 + (k % 2) * 1.1, cz - 8 + Math.floor(k / 2), k % 2 ? 0x248b8f : 0xe0b940); }
    solid(-135, cz - 7.5, 2.2, 1.9, 0.7);
    person(-139.2, cz - 17, Math.PI, 'Talk', { ...FISHER, top: 0xe2b234 });
    person(-138.4, cz - 4, Math.PI / 2, 'Idle', FISHER, { x: -138.4, z: cz + 2 });
    person(-141, cz + 15, Math.PI / 2, 'Idle', { ...FISHER, top: 0xcf5936 });
    person(-136.6, cz + 8, -Math.PI / 2, 'Talk', FISHER);
    // Fish market: coloured roofs, silver fish, scales, wash basins, women trading.
    shade(cx - 8, cz + 3, 25, 9, 0x357c93);
    for (let k = 0; k < 3; k++) {
      const x = cx - 17 + k * 8;
      table(x, cz + 3, 5, WHITE);
      for (let f = 0; f < (lite ? 3 : 6); f++) {
        const geo = new THREE.SphereGeometry(0.19, 6, 4); geo.scale(2.2, 0.35, 0.65);
        b.geometry(geo, f % 2 ? 0x9ab5bd : 0xc0d0d1, x - 1.65 + (f % 3) * 1.6, 1.06, cz + 2.75 + Math.floor(f / 3) * 0.45, 0.2);
      }
      b.cyl(0.5, 0.4, 0.3, x + 1.8, FLOOR, cz + 1.4, 0x4586b3, 10);
      person(x, cz + 1.5, 0, 'Talk', { ...VENDOR, top: [0xd66532, 0x387f77, 0x79529a][k] });
    }
    sign('JËN · POISSON DU JOUR', cx - 8, cz + 7.55, '#24657b', 3.4, 15);
    place('fish-market', 'Marché au poisson', cx - 8, cz + 8.5, A.fish, 'Jën bu bees ! Le poisson du jour est sur les étals.', 3.5);
    // Artisans along the street edge, behind the landing market.
    for (let k = 0; k < 3; k++) {
      const x = cx - 14 + k * 12, z = cz - 16;
      shop(['Vannerie', 'Cuir & bois', 'Pirogues peintes'][k], x, z, 0xc58b57, 10);
      for (let n = 0; n < 3; n++) {
        if (k === 0) b.cyl(0.38, 0.22, 0.42, x - 2.8 + n * 2.2, 1.32, z - 3, 0xcda55c, 10);
        else if (k === 1) box(0.65, 0.5, 0.25, x - 2.8 + n * 2.2, z - 3, 0x71452e, 1.32);
        else pirogue(b, x - 2.5 + n * 2.2, z - 3, 1.2, 0, n, 1.32);
      }
      person(x + 1.5, z, 0, 'Talk');
    }
    place('craft', 'Ateliers de Soumbédioune', cx, cz - 9, A.craft, 'Bienvenue à l’atelier. Chaque objet commence entre les mains de quelqu’un.', 3.4);
    bench(cx + 13, cz + 14); c.tree(cx + 17, cz + 16, 1.5); c.pool(cx - 8, cz + 4, 12);
    return;
  }

  if (kind === 'bank') {
    const name = `Banque Teranga · ${c.hub === 'pikine' ? 'Pikine' : 'Plateau'}`;
    const x = cx, z = cz - 7, w = 32, d = 22, h = 5.5;
    pave.box(41, 0.04, 41, cx, 0.07, cz, 0xd5d4c6);
    c.floor.box(w - 0.4, 0.012, d - 0.4, x, TERRAZZO_Y, z, TERRAZZO);                   // terrazzo hall floor
    for (const dx of [-w / 2, w / 2]) { box(0.4, h, d, x + dx, z, WHITE); solid(x + dx, z, 0.4, d, h); }
    box(w, h, 0.4, x, z - d / 2, WHITE); solid(x, z - d / 2, w, 0.4, h);
    // Upper offices only at the back; entrance and waiting court stay visible from the game camera.
    box(w, 6.5, 8, x, z - 7, 0xe9e4d9, h);
    for (let k = 0; k < 7; k++) glass.box(3.2, 3.6, 0.1, x - 13.5 + k * 4.5, h + 1.5, z - 2.95, 0x3d7890);
    b.slab(w + 1, 0.25, 9, x, h + 6.5, z - 7, DARK);
    b.slab(w + 1, 0.22, 3, x, h, z + 10, 0x246b68);
    for (const dx of [-15, 15]) box(0.45, h, 0.45, x + dx, z + 10, DARK);
    sign('BANQUE TERANGA', x, z + 11.56, '#145d5b', 4.55, 21);
    sign('ACCUEIL · AGENCE', x, z - 2.4, '#145d5b', 3.2, 8);
    table(x, z - 1, 9, WHITE);
    person(x - 1, z - 2.8, 0, 'Talk', { ...FISHER, top: WHITE, bottom: DARK, hat: null });
    for (const dx of [-10, 10]) { bench(x + dx, z + 2, dx < 0 ? Math.PI / 2 : -Math.PI / 2); person(x + dx, z + 2, dx < 0 ? Math.PI / 2 : -Math.PI / 2, 'Sit'); }
    place('bank', name, cx, cz + 1.5, A.bank, 'Dalal ak jàmm. Pour ton projet, passe à l’accueil.', 3.3);
    // ATM casing is scenery until accounts and a server ledger are delivered.
    box(1.7, 2.35, 0.85, cx + 12, cz + 15, 0x246b68);
    solid(cx + 12, cz + 15, 1.7, 0.85, 2.35);
    glass.box(1, 0.62, 0.08, cx + 12, 1.35, cz + 15.47, 0x619caa);
    box(0.7, 0.04, 0.2, cx + 12, cz + 15.45, DARK, 1.1);
    sign('TERANGA', cx + 12, cz + 15.5, '#145d5b', 2.23, 1.45);
    c.tree(cx - 17, cz + 16, 1.2); c.pool(cx, cz + 2, 9); c.pool(cx + 12, cz + 15, 4);
    return;
  }

  if (kind === 'mall') {
    c.floor.box(44, 0.012, 44, cx, TERRAZZO_Y, cz, TERRAZZO);                           // terrazzo courtyard
    const shops = [
      { dx: -14, name: 'Ndar Tech', actions: A.tech, mode: 'tech' as const, key: 'tech' },
      { dx: 0, name: 'Style Rek', actions: A.style, mode: 'cloth' as const, key: 'style' },
      { dx: 14, name: 'Maison Dakar', actions: A.household, mode: 'home' as const, key: 'household' },
    ];
    for (const s of shops) {
      shop(s.name, cx + s.dx, cz - 12, 0xb95c37, 12); goods(cx + s.dx, cz - 12, s.mode);
      place(`mall-${s.key}`, s.name, cx + s.dx, cz - 6.3, s.actions, 'Dalal ak jàmm ! Entre, prends le temps de regarder.', 2.8);
      person(cx + s.dx + 2, cz - 10, 0, 'Talk');
    }
    // Continuous upper facade makes the gallery a shopping complex, with ground-level shops below.
    box(43, 4.2, 8, cx, cz - 12, 0xdfc8a5, 4.15);
    for (let k = 0; k < 10; k++) {
      glass.box(3.2, 2.2, 0.08, cx - 19 + k * 4.2, 5.05, cz - 7.94, 0x417f92);
      box(0.2, 4.2, 0.25, cx - 21 + k * 4.2, cz - 7.8, 0xf2e8d3, 4.15);
    }
    b.slab(44, 0.3, 9, cx, 8.45, cz - 12, DARK);
    sign('DAKAR LIFE', cx, cz - 7.7, '#9a472d', 7.7, 15);
    // Two tall pylons and a broad canopy frame a walkable courtyard, rather than sealing the mall in a box.
    for (const dx of [-20, 20]) { box(1.2, 8, 1.2, cx + dx, cz + 20, 0xb95c37); solid(cx + dx, cz + 20, 1.2, 1.2, 8); }
    b.slab(42, 0.7, 3, cx, 7.9, cz + 20, 0xe9d5b1);
    sign('DAKAR LIFE MALL', cx, cz + 21.55, '#9a472d', 6.8, 30);
    sign('GALERIE · BOUTIQUES · RENCONTRES', cx, cz + 21.6, '#9a472d', 5.1, 21);
    place('mall', 'Dakar Life Mall', cx, cz + 17, A.mall, 'On se retrouve dans la cour ? Les boutiques sont juste derrière.', 3.2);
    // Juice counter and shaded seating on the east; central axis stays open for players.
    shade(cx + 14, cz + 6, 10, 8, 0xcc9a50); table(cx + 14, cz + 4, 6, WHITE);
    sign('JUS & GO', cx + 14, cz + 10.05, '#49704b', 3.3, 7);
    person(cx + 14, cz + 2.5, 0, 'Talk', VENDOR);
    place('mall-juice', 'Jus & Go', cx + 14, cz + 7, A.juice, 'Bouye ou bissap ? On te prépare ça.', 2.8);
    for (const dz of [1, 9]) { bench(cx - 14, cz + dz); person(cx - 14, cz + dz, 0, 'Sit'); }
    for (const dx of [-7, 7]) { c.tree(cx + dx, cz + 9, 1.2); box(3, 0.4, 3, cx + dx, cz + 9, 0xb9a38c); solid(cx + dx, cz + 9, 3, 3, 0.6); }
    person(cx - 3.5, cz + 3, 0.7); person(cx - 2.5, cz + 5, -2.4);
    c.pool(cx, cz + 13, 11); c.pool(cx, cz - 5, 13);
    return;
  }

  if (kind === 'shops') {
    pave.box(43, 0.035, 43, cx, 0.07, cz, 0xd9c9a8);
    const pikine = c.hub === 'pikine';
    shop(pikine ? 'Boutique Diallo' : 'Atelier Ndeye', cx - 11, cz - 10, pikine ? 0x368f8d : 0xc69055, 17);
    goods(cx - 11, cz - 10, pikine ? 'food' : 'cloth');
    place('boutique', pikine ? 'Boutique Diallo' : 'Atelier Ndeye · couture', cx - 11, cz - 4.3, pikine ? A.boutique : A.style, pikine ? 'Jaaraama ! Mamadou t’accueille. Du pain, du lait ou un petit service ?' : 'Dalal ak jàmm. Les commandes de la fête arrivent.', 3);
    person(cx - 7.5, cz - 9, 0, 'Talk', { ...FISHER, style: 'boubou', top: 0xe8decb, hatColor: 0xeee4d4 });
    shop(pikine ? 'Salon Awa' : 'Dakar Réparation', cx + 11, cz - 10, pikine ? 0xca7f93 : 0x437282, 17);
    goods(cx + 11, cz - 10, pikine ? 'home' : 'tech');
    place('salon-tech', pikine ? 'Salon Awa' : 'Dakar Réparation', cx + 11, cz - 4.3, pikine ? A.salon : A.tech, pikine ? 'Viens t’asseoir. Aujourd’hui, tout le quartier parle de l’arène.' : 'Téléphones, accessoires, commandes : il y a toujours de quoi s’occuper.', 3);
    person(cx + 14, cz - 9, 0, 'Talk', pikine ? VENDOR : FISHER);
    bench(cx - 11, cz + 11); bench(cx + 11, cz + 11);
    c.tree(cx, cz + 14, 1.7); c.pool(cx - 11, cz - 3, 6); c.pool(cx + 11, cz - 3, 6);
    return;
  }

  // Neighbourhood meeting squares: a recognisable address where players can stand together.
  const names: Record<HubId, string> = { pikine: 'Grand-place de Pikine', plateau: 'Place de la Médina', corniche: 'Place des étudiants · Fann', almadies: 'Place des voisins · Ngor' };
  pave.box(42, 0.035, 42, cx, 0.07, cz, c.hub === 'pikine' ? 0xc9b187 : 0xdfd6c3);
  b.cyl(6, 6, 0.04, cx, 0.105, cz, 0xc7784b, 24);
  c.tree(cx, cz, 2.3); c.tree(cx + 16, cz - 15, 1.1); c.tree(cx - 16, cz + 15, 1.1);
  for (const dx of [-11, 11]) for (const dz of [-8, 8]) bench(cx + dx, cz + dz, dx < 0 ? Math.PI / 2 : -Math.PI / 2);
  table(cx - 11, cz - 1, 2.4); // checkers table
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) b.flat(0.115, 0.115, cx - 11.4 + x * 0.115, 1.002, cz - 1.4 + z * 0.115, (x + z) % 2 ? DARK : WHITE);
  for (let n = 0; n < 8; n++) b.cyl(0.046, 0.046, 0.025, cx - 11.3 + (n % 4) * 0.23, 1.005, cz - 1.28 + Math.floor(n / 4) * 0.6, n < 4 ? 0xb94734 : 0x1e2625, 8);
  shade(cx + 11, cz - 1, 7, 6, 0xdca953); table(cx + 11, cz - 1, 2.4);
  b.sphere(0.17, cx + 11, 1.05, cz - 1, 0x426c60); // teapot and glasses
  for (let n = 0; n < 3; n++) b.cyl(0.06, 0.06, 0.12, cx + 10.55 + n * 0.25, 1, cz - 0.6, WHITE, 6);
  person(cx + 9.4, cz - 1, Math.PI / 2, 'Talk'); person(cx + 12.6, cz - 1, -Math.PI / 2, 'Talk');
  person(cx - 12.7, cz - 1, Math.PI / 2, 'Sit'); person(cx - 9.3, cz - 1, -Math.PI / 2, 'Sit');
  person(cx + 11, cz + 8, -Math.PI / 2, 'Sit'); person(cx - 11, cz - 8, Math.PI / 2, 'Sit');
  sign(names[c.hub].toUpperCase(), cx, cz + 20, '#68432c', 3, 18);
  for (const dx of [-10, 10]) box(0.15, 2.8, 0.15, cx + dx, cz + 20, WOOD);
  place('square', names[c.hub], cx + 10.5, cz + 3, A.square, 'Nanga def ? Pose-toi. Il reste de l’attaya et une place à l’ombre.', 3.2);
  c.pool(cx + 11, cz - 1, 8); c.pool(cx - 11, cz - 1, 8);
}

/** Open, tapered wooden hull with raised ends (thwarts, motor box at the +z stern), merged into `b` (also used by src/venues). */
export function pirogue(b: Batch, x: number, z: number, length: number, yaw: number, variant: number, y = 0.08) {
  const palettes = [[0x236baa, 0xe3bd3a, 0xd74b38], [0x287c63, 0xd74b38, 0xf2dfa1], [0xdfa736, 0x246899, 0x2f8567]];
  const colors = palettes[variant % palettes.length], scale = length / 10;
  const hull = (low: number, high: number, color: number) => {
    const positions: number[] = [], indexes: number[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, width = (0.13 + Math.sin(t * Math.PI) * 0.94) * scale;
      const lift = Math.pow(Math.abs(t - 0.5) * 2, 3) * 0.65 * scale;
      for (const side of [-1, 1]) for (const f of [low, high]) positions.push(side * width * (0.45 + f * 0.55), lift + f * 0.8 * scale, (t - 0.5) * length);
    }
    for (let k = 0; k < 12; k++) for (const offset of [0, 2]) {
      const a = k * 4 + offset, d = a + 4;
      indexes.push(a, a + 1, d, a + 1, d + 1, d, d, a + 1, a, d, d + 1, a + 1); // both sides of the thin plank
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indexes); geo.computeVertexNormals();
    b.geometry(geo, color, x, y, z, yaw);
  };
  hull(0, 0.62, colors[0]); hull(0.62, 0.79, colors[1]); hull(0.79, 1, colors[2]);
  const point = (xx: number, zz: number) => ({ x: x + Math.cos(yaw) * xx + Math.sin(yaw) * zz, z: z - Math.sin(yaw) * xx + Math.cos(yaw) * zz });
  const p = point(0, 0); b.box(0.8 * scale, 0.08 * scale, length * 0.8, p.x, y + 0.12 * scale, p.z, WOOD, yaw);
  for (const t of [-0.25, 0, 0.25]) { const q = point(0, length * t); b.box(1.6 * scale, 0.09 * scale, 0.38 * scale, q.x, y + 0.6 * scale, q.z, WOOD, yaw); }
  for (const t of [-0.5, 0.5]) { const q = point(0, length * t); b.box(0.25 * scale, 1.45 * scale, 0.35 * scale, q.x, y + 0.2 * scale, q.z, colors[2], yaw); }
  const stern = point(0, length * 0.46); b.box(0.4 * scale, 0.55 * scale, 0.55 * scale, stern.x, y + 0.65 * scale, stern.z, DARK, yaw);
}
