import * as THREE from 'three';
import type { PersonLook } from '../actors/humanoid';
import type { Action, HubWorld, Interactable } from '../world/types';
import { signTexture } from '../world/batch';
import { buildShopInterior, type ShopDetail, type ShopInterior } from '../world/shopKit';

/**
 * « Quincaillerie · meubles » (Pikine): the furniture stall of the first economy lane, rebuilt as a small shop of the
 * kit (src/world/shopKit.ts `hardware`, variant 1 « · meubles », open front) on the free end of the Maïga du marché's
 * lot, on the Maïga's front line: tools on the pegboard behind the counter, shelves of paint and parts, cement sacks,
 * pipes on the right wall, then the furniture it sells (monobloc chairs stacked, a rolled mattress, a mirror), folded
 * rugs and a small radio on the counter. The sheet stands at the counter (« Voir les meubles », the same catalogue
 * as before); the shopkeeper behind it. One mesh on the kit's atlas.
 */
export const QUINCAILLERIE = { w: 6.8, d: 6, h: 3.4 } as const;
const G = 0.12;
const KEEPER: PersonLook = { skin: 0x5b3420, style: 'tee', top: 0x2b2f36, bottom: 0x6b5a4a, hat: 'kufi', hatColor: 0xf2f2ec, shoes: 0x2b2b33 };

/** Its centre on the Maïga du marché's lot, from the Maïga's sheet (1.9 m in front of the kiosk, which is 7 m wide). */
export function quincaillerieAt(maiga: { x: number; z: number }) {
  return { x: maiga.x + 7.5, z: maiga.z - 1.9 - QUINCAILLERIE.d / 2 - 0.1, y: G };
}

/** Builds it into the hub: the stocked shop, its sign, colliders, the keeper and its sheet (returned). */
export function buildQuincaillerie(world: HubWorld, maiga: { x: number; z: number }, action: Action, detail: ShopDetail = 'medium'): { shop: ShopInterior; sheet: Interactable } {
  const at = quincaillerieAt(maiga), { w, d, h } = QUINCAILLERIE, id = `${world.id}:shop:meubles`;
  const shop = buildShopInterior('hardware', { w, d }, 2718, { detail, at, shell: 'open', id, height: h, shadows: false, variant: 1 });
  shop.group.userData.shop = { key: id, type: 'hardware', anchors: shop.anchors, bounds: shop.bounds, budget: shop.budget, front: shop.front };
  shop.group.userData.shopColliders = shop.colliders;
  world.group.add(shop.group); world.colliders.push(...shop.colliders); world.seats.push(...shop.seats);
  const tex = signTexture('QUINCAILLERIE · MEUBLES', '#1f2937', '#fde68a', 768, 112);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.2, 0.6), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }));
  sign.position.set(at.x, G + h - 0.35, at.z + d / 2 + 0.03); world.group.add(sign); world.signs.push(sign);
  const k = shop.anchors.keeper;
  world.people.push({ x: k.x, z: k.z, yaw: k.yaw, clip: 'Talk', look: KEEPER });
  const c = shop.anchors.counter;
  const sheet: Interactable = { id, name: 'Quincaillerie · meubles', kind: 'actions', x: c.x, z: c.z, radius: 2.4, actions: [action] };
  world.interactables.push(sheet);
  return { shop, sheet };
}
