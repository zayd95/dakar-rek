import type { HubWorld, Interactable } from '../world/types';
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
