import type { HubWorld, Interactable } from '../world/types';
import { vehicleSpec } from '../actors/vehicleKit';
import { motoSpec, jakartaSeed, MOTO_ASSET, MOTO_DETAIL } from './moto';
import { OwnedVehicleModule, type DealerSite } from './ownedModule';

/**
 * Personal mobility, first step: the player's own Jakarta motorbike (src/transport/ownedModule.ts does the work).
 * Bought at the « Motos · Garage Modou » corner in Pikine (shop recipe; price shown, then confirmed; paid once), it is
 * delivered at the kerb in front of the garage. Get on (« Monter sur la moto »), ride (stick: up accelerates, down
 * brakes then reverses, left / right steers; collisions with the walls, parked vehicles and the car rapides), get off
 * (« Descendre de la moto ») — it stays parked where you leave it, in that hub, across reloads.
 */

/** The dealer corner: at the east end of Garage Modou's pavement (south row of its block, facing the road at z ≈ 0). */
function motoDealer(hub: HubWorld): DealerSite | null {
  const garage = hub.interactables.find((i: Interactable) => i.id === 'pikine:garage:31');
  if (!garage) return null;
  const x = garage.x + 8.5, z = garage.z, road = Math.round(z / 60) * 60, side = Math.sign(z - road) || -1;
  // two display motorbikes nose to the road, on the pavement pushed back from the kerb; delivered at the kerb in front
  const zd = z + side * 0.5, seed = jakartaSeed();
  const delivery = { x: garage.x + 1.5, z: road + side * 4.3, yaw: Math.PI / 2 };
  return {
    counter: { x, z: z - side * 0.2 },
    sign: { x: x + 3.2, z: z + side * 0.6, yaw: 0 },
    displays: [-1.6, 1.6].map(dx => ({ x: x + dx, z: zd, yaw: side > 0 ? Math.PI : 0, seed: seed + (dx > 0 ? 7 : 3) })),
    delivery,
    kerb: [{ x: delivery.x, z: delivery.z, dx: 1, dz: 0, rx: 0, rz: side, offset: 4.3, from: -10, to: 6 }],
  };
}

export const moto = new OwnedVehicleModule({
  key: 'moto', asset: MOTO_ASSET, detail: MOTO_DETAIL, icon: '🏍️', kit: 'moto',
  seed: jakartaSeed, spec: motoSpec, height: 1.1, space: 'moto:jakarta',
  dealer: {
    hub: 'pikine', name: 'Motos · Garage Modou', catalogue: 'motos', site: motoDealer,
    sign: { bg: '#c0392b', band: '#f4c20d', title: 'MOTOS JAKARTA', sub: 'Garage Modou', subColor: '#1b2a7a' },
  },
  text: {
    mine: 'Ta moto Jakarta', getOn: 'Monter sur la moto', getOff: 'Descendre de la moto',
    confirm: 'Acheter la Moto Jakarta ?', delivered: 'D’occasion, livrée devant le garage, prête à rouler',
    welcome: 'Ta moto t’attend au bord de la route. Jërëjëf !', parked: 'Moto garée.', owned: 'Elle est déjà à toi',
  },
  exit: 'left', reach: 1.8,
});

// ------------------------------------------------------------------ the Tiak Tiak courier's bike (lent, free)

/** A kit seed giving a motorbike that is not the red Jakarta (the lent bike looks different). */
let tiakSeedCache = 0;
export function tiakSeed(): number {
  if (tiakSeedCache) return tiakSeedCache;
  const red = vehicleSpec('moto', { seed: jakartaSeed(), driver: false, passengers: false }).colors.body;
  for (let s = 1; s < 400; s++) {
    const sp = vehicleSpec('moto', { seed: s, driver: false, passengers: false });
    if (sp.variant < 10 && sp.colors.body !== red) return (tiakSeedCache = s);
  }
  return (tiakSeedCache = 2);
}

/**
 * Where the lent bike waits in a hub: a few metres from where the player arrives, on free ground (clear of every
 * collider by a metre, inside the hub), facing the way the player faces.
 */
export function tiakDepot(hub: HubWorld): { x: number; z: number; yaw: number } | null {
  const sp = hub.spawn, b = hub.bounds, free = (x: number, z: number) =>
    x > b.x0 + 2 && x < b.x1 - 2 && z > b.z0 + 2 && z < b.z1 - 2 && !hub.colliders.some(c => x > c.x0 - 1.2 && x < c.x1 + 1.2 && z > c.z0 - 1.2 && z < c.z1 + 1.2);
  for (const r of [3, 4, 5.5, 7, 9]) {
    for (let k = 0; k < 8; k++) {
      const a = sp.yaw + Math.PI / 2 + (k * Math.PI) / 4, x = sp.x + Math.sin(a) * r, z = sp.z + Math.cos(a) * r;
      if (free(x, z)) return { x, z, yaw: sp.yaw };
    }
  }
  return null;
}

/**
 * Tiak Tiak lends a basic motorbike in every hub: « Monter » at any time, no purchase, no delivery needed. It carries the
 * courier's box with the run's parcel in it. The paid Jakarta above stays the bike to own. Same riding as every bike here.
 */
export const tiakMoto = new OwnedVehicleModule({
  key: 'tiak', asset: 'tiak', detail: 'Prêtée par Tiak Tiak', icon: '🏍️', kit: 'moto',
  seed: tiakSeed, spec: motoSpec, height: 1.1, space: 'moto:tiak',
  loaner: { depot: tiakDepot }, box: true,
  text: {
    mine: 'Moto Tiak Tiak', getOn: 'Monter', getOff: 'Descendre', confirm: '', delivered: '', welcome: '', parked: 'Moto garée.', owned: 'Prêtée',
  },
  exit: 'left', reach: 2.2,
});
