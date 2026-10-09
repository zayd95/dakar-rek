import * as THREE from 'three';
import { daylight } from '../core/clock';
import { clamp } from '../core/rng';
import type { GameModule } from './modules';
import { buildShopInterior, setShopNight, SHOP_TYPES, type ShopDetail, type ShopInterior, type ShopType } from '../world/shopKit';

/**
 * Shops: the city's shop interiors are stocked by the hub builder from the shop kit (src/world/city.ts →
 * src/world/shopKit.ts) — their places, counters and keepers come with the hub. This module lights their tubes, screens
 * and fridges at night and gives the checks (?debug) the list of stocked shops, `shops()`, and a showroom of every
 * type, `shopShowroom({ types, detail })`.
 */
let showroom: THREE.Group | null = null;
let built: ShopInterior[] = [];
let ground: THREE.Mesh | null = null;
function clear() {
  for (const s of built) s.dispose(); built = [];
  if (ground) { ground.geometry.dispose(); (ground.material as THREE.Material).dispose(); ground = null; }
  showroom?.removeFromParent(); showroom = null;
}

export const shopsModule: GameModule = {
  name: 'shops',
  hubLoaded() { clear(); },
  update(ctx) { setShopNight(1 - clamp(daylight(ctx.hour()) * 3.2, 0, 1)); },
  debug(ctx) {
    return {
      /** Every stocked shop of the hub: its place key, type, anchors (world), footprint and budget. */
      shops() {
        const w = ctx.world(); if (!w) return [];
        const out: unknown[] = [];
        w.group.traverse(o => { if (o.userData.shop) out.push({ ...o.userData.shop, visible: o.visible }); });
        return out;
      },
      /** One shop of each type side by side on a plain floor far from the hub; returns where each one stands. */
      shopShowroom(o: { types?: ShopType[]; x?: number; z?: number; detail?: ShopDetail; w?: number; d?: number; gap?: number } = {}) {
        clear();
        const g = new THREE.Group(); g.name = 'shop_showroom';
        const types = o.types ?? [...SHOP_TYPES], W = o.w ?? 10, D = o.d ?? 8, gap = o.gap ?? 3, x0 = o.x ?? 4000, z0 = o.z ?? 0;
        ground = new THREE.Mesh(new THREE.PlaneGeometry(types.length * (W + gap) + 40, D + 40), new THREE.MeshLambertMaterial({ color: 0xcfc6b6 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(x0 + (types.length * (W + gap)) / 2, 0, z0); ground.receiveShadow = true; g.add(ground);
        const spots = types.map((t, i) => {
          const fp = t === 'bank' ? { w: Math.max(W, 14), d: Math.max(D, 10) } : { w: W, d: D };
          const x = x0 + i * (W + gap) + W / 2;
          const s = buildShopInterior(t, fp, 1, { detail: o.detail ?? ctx.quality(), at: { x, z: z0, y: 0.01 }, variant: i % 3 });
          g.add(s.group); built.push(s);
          return { type: t, x, z: z0, w: fp.w, d: fp.d, budget: s.budget, anchors: s.anchors };
        });
        ctx.scene.add(g); showroom = g;
        return spots;
      },
      shopClear: clear,
    };
  },
};
