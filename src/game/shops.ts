import * as THREE from 'three';
import { daylight } from '../core/clock';
import { clamp } from '../core/rng';
import type { GameModule } from './modules';
import type { PersonLook } from '../actors/humanoid';
import type { Interactable } from '../world/types';
import type { Interior } from '../world/interiors';
import { ENTER } from '../world/content';
import { Cast, type Role } from '../venues/cast';
import { buildShopInterior, setShopNight, SHOP_TYPES, type ShopDetail, type ShopInterior, type ShopType } from '../world/shopKit';

/**
 * Shops: the city's open-front shops are stocked by the hub builder from the shop kit (src/world/city.ts →
 * src/world/shopKit.ts) — their places, counters and keepers come with the hub. This module
 *  - turns the café kiosks of the four hubs (Café Touba, facades until now) into walk-in cafés: « Entrer » on their
 *    sheet, a room stocked by the same kit (shell mode) off the map, the café's own menu at the inside counter, the
 *    barista behind it and a regular on a stool;
 *  - lights tubes, screens and fridges at night;
 *  - gives the checks (?debug) the stocked shops, `shops()`, the walk-in cafés, `shopRooms()`, and a showroom of every
 *    type of the kit, `shopShowroom({ types, detail })`.
 */
const BARISTA: PersonLook = { skin: 0x5b3420, style: 'tee', top: 0x14532d, bottom: 0x2b2f3a, shoes: 0x1d1d1f, hat: 'kufi', hatColor: 0xf2f2ec };
const REGULAR: PersonLook = { skin: 0x6b3f25, style: 'boubou', top: 0xe8decb, pattern: 'bazin', hat: 'kufi', hatColor: 0x1c1c1f };
/** Kiosk kinds that get a walk-in room, and the kit type that stocks it. */
const WALK_IN: { frag: string; type: ShopType; w: number; d: number }[] = [{ frag: ':cafe:', type: 'cafe', w: 9, d: 7 }];
const ROOM_X = 2600, ROOM_GAP = 30;

interface Room { door: Interactable; shop: ShopInterior; cast: Cast | null }
let rooms: Room[] = [];
let showroom: THREE.Group | null = null;
let built: ShopInterior[] = [];
let ground: THREE.Mesh | null = null;
function clearShowroom() {
  for (const s of built) s.dispose(); built = [];
  if (ground) { ground.geometry.dispose(); (ground.material as THREE.Material).dispose(); ground = null; }
  showroom?.removeFromParent(); showroom = null;
}
const seedOf = (k: string) => { let h = 2166136261; for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619); return (h >>> 0) % 100000 + 1; };

export const shopsModule: GameModule = {
  name: 'shops',
  hubLoaded(ctx, hub) {
    clearShowroom();
    for (const r of rooms) { r.cast?.dispose(); r.shop.dispose(); }
    rooms = [];
    const detail = ctx.quality();
    let n = 0;
    for (const it of hub.interactables) {
      const spec = WALK_IN.find(w => it.id.includes(w.frag));
      if (!spec || it.actions.some(a => a.special === 'enter')) continue;
      const ox = ROOM_X + n++ * ROOM_GAP, oz = 0;
      const shop = buildShopInterior(spec.type, { w: spec.w, d: spec.d }, seedOf(it.id), { shell: true, detail, at: { x: ox, z: oz, y: 0.1 }, id: `${it.id}:salle`, space: it.id, height: 3.2 });
      const a = shop.anchors, b = shop.bounds;
      const interactables: Interactable[] = [
        { id: `${it.id}:sortir`, name: 'Sortir', kind: 'actions', x: a.door.x, z: a.door.z + 0.2, radius: 1.2, actions: [{ id: 'sortir', label: 'Sortir', seconds: 0, special: 'exit' }] },
        // the café's own menu, now at its counter inside
        { id: `${it.id}:comptoir`, name: it.name, kind: 'actions', x: a.counter.x, z: a.counter.z, radius: 2.2, actions: it.actions.slice(), description: 'Au comptoir. Café Touba bien serré, ou on reste discuter.' },
      ];
      const int: Interior = {
        kind: 'venue', name: it.name, group: shop.group, colliders: shop.colliders, interactables, seats: shop.seats,
        bounds: { x0: b.x0 + 0.3, x1: b.x1 - 0.3, z0: b.z0 + 0.3, z1: b.z1 - 0.3 },
        cameraBox: { x0: b.x0 + 0.15, x1: b.x1 - 0.15, z0: b.z0 + 0.15, z1: b.z1 - 0.15 },
        spawn: { x: a.door.x, z: a.door.z, yaw: Math.PI },
        light: new THREE.Vector3(ox, 2.6, oz), lightColor: 0xfff1d8,
      };
      it.actions = [ENTER, ...it.actions];
      ctx.addInterior(it, int);
      // the barista behind the counter, a regular on a stool (the interior's seats are registered in the door's space)
      const stool = shop.seats.find(s => s.kind === 'stool');
      const roles: Role[] = [{ id: 'barista', look: BARISTA, x: a.keeper.x, z: a.keeper.z, yaw: a.keeper.yaw, y: 0.1, clip: 'Idle', when: () => true }];
      if (stool && ctx.quality() !== 'low') roles.push({ id: 'habitue', look: REGULAR, seat: { ...stool, space: it.id }, when: () => true });
      const cast = new Cast(roles, ctx.seats, ctx.extra, `${it.id}:salle`);       // world coordinates; shown only inside
      cast.setMoment('open');
      rooms.push({ door: it, shop, cast });
    }
  },
  update(ctx, dt) {
    setShopNight(1 - clamp(daylight(ctx.hour()) * 3.2, 0, 1));
    const space = ctx.space();
    for (const r of rooms) r.cast?.update(dt, ctx.camera.position, 25, space === r.door.id);
  },
  debug(ctx) {
    return {
      /** Every stocked shop of the hub: its place key, type, anchors (world), footprint and budget. */
      shops() {
        const w = ctx.world(); if (!w) return [];
        const out: unknown[] = [];
        w.group.traverse(o => { if (o.userData.shop) out.push({ ...o.userData.shop, visible: o.visible }); });
        return out;
      },
      /** Show or hide every stocked shop interior of the hub (performance A/B in the checks); returns how many. */
      shopsVisible(v: boolean) {
        let n = 0; ctx.world()?.group.traverse(o => { if (o.userData.shop) { o.visible = v; n++; } });
        return n;
      },
      /** The walk-in rooms of this hub (door sheet, type, anchors, budget, people present). */
      shopRooms: () => rooms.map(r => ({ door: r.door.id, name: r.door.name, type: r.shop.type, anchors: r.shop.anchors, bounds: r.shop.bounds, budget: r.shop.budget, people: r.cast?.presentCount ?? 0 })),
      /** One shop of each type side by side on a plain floor far from the hub; returns where each one stands. */
      shopShowroom(o: { types?: ShopType[]; x?: number; z?: number; detail?: ShopDetail; w?: number; d?: number; gap?: number } = {}) {
        clearShowroom();
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
      shopClear: clearShowroom,
    };
  },
};
