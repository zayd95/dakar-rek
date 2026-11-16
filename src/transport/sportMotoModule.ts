import type { HubWorld, Interactable } from '../world/types';
import { OwnedVehicleModule, type DealerSite, type Spot } from './ownedModule';
import { SABAR_ASSET, SABAR_DETAIL, SABAR_PAINTS, sabarSeedOf, sabarSpec } from './sportMoto';
import { say } from '../i18n/wolof';

/**
 * The sport motorbike, « Sabar 600 » (src/transport/sportMoto.ts), on the owned-vehicle system (src/transport/ownedModule.ts): ONE ownable asset, sold at
 * two dealers in two districts, each in its own colourway:
 *   - Garage Modou, Pikine (beside the Jakarta's corner, on the same pavement, west of the workshop): « rouge et blanc »;
 *   - Ndiaye Auto, Plateau (on the pavement at the showroom's south corner, by the road): « jaune et noir ».
 * Each stand is a kerb dealer: the bike on show with its price card (its colour named), « Voir les articles » at the counter (« Essayer gratuitement »,
 * then « Acheter · Sabar 600 <colour> », the price shown, then confirmed, paid once), delivered at the kerb in front, in that dealer's colour (its paint seed
 * kept in the save). Bought at one, the other dealer's listing says « Tu as déjà ta Sabar 600 <colour> » and keeps its own bike on show.
 */

/**
 * A stand on the pavement of a straight road: `o` a point of the road's centre line, `along` the way the traffic of that side goes (Senegal drives on the
 * right), `out` from the road towards the buildings. Positions as (metres along, metres from the centre line): the kerb lane is 3–5.2 m out, the pavement
 * 5.2–7.5, the shop fronts beyond.
 */
function stand(o: { x: number; z: number }, along: { x: number; z: number }, out: { x: number; z: number }, paint: number): DealerSite {
  const yaw = Math.atan2(along.x, along.z);
  const at = (a: number, l: number, y = yaw): Spot => ({ x: o.x + along.x * a + out.x * l, z: o.z + along.z * a + out.z * l, yaw: y });
  const delivery = at(0, 4.3), facing = Math.atan2(-out.x, -out.z);                  // the card faces the road
  return {
    counter: { x: at(-1.6, 6.9).x, z: at(-1.6, 6.9).z },
    sign: { ...at(-2.9, 7.3, facing), w: 2.4 },
    displays: [{ ...at(0, 6.0, yaw + 0.45), seed: paint }],                          // on the pavement, the nose turned a little to the road
    forSale: 0, card: at(1.5, 5.3, facing),
    delivery,
    kerb: [{ x: delivery.x, z: delivery.z, dx: along.x, dz: along.z, rx: out.x, rz: out.z, offset: 4.3, from: -4, to: 4 }],
  };
}

/** Garage Modou (Pikine): 14 m west of the workshop's door, on its pavement (the road z = 0 in front of it), past the repair bay and the Jakarta's corner. */
export function sabarModou(hub: HubWorld): DealerSite | null {
  const garage = hub.interactables.find((i: Interactable) => i.id === 'pikine:garage:31');
  if (!garage) return null;
  const road = Math.round(garage.z / 60) * 60, side = Math.sign(garage.z - road) || -1;
  return stand({ x: garage.x - 12, z: road }, { x: side < 0 ? -1 : 1, z: 0 }, { x: 0, z: side }, sabarSeedOf(0));
}

/** Ndiaye Auto (Plateau): the showroom is open on the road x = 120 (src/world/city.ts); the stand is on its pavement just past the showroom's south corner. */
export const NDIAYE_SABAR = { road: 120, z: 105 } as const;
export function sabarNdiaye(hub: HubWorld): DealerSite | null {
  if (hub.id !== 'plateau') return null;
  return stand({ x: NDIAYE_SABAR.road, z: NDIAYE_SABAR.z }, { x: 0, z: 1 }, { x: -1, z: 0 }, sabarSeedOf(1));
}

const P = SABAR_PAINTS;
export const sabar = new OwnedVehicleModule({
  key: 'sabar', asset: SABAR_ASSET, detail: SABAR_DETAIL, icon: '🏍️', kit: 'moto', sound: 'sport',
  seed: () => sabarSeedOf(0), spec: sabarSpec, visual: seed => sabarSpec().build({ seed }), height: 1.2, space: 'moto:sabar',   // the bike on show: its own body in that stand's colourway
  dealer: {
    hub: 'pikine', name: 'Garage Modou · Motos sportives', catalogue: 'motos', site: sabarModou, paint: { seed: sabarSeedOf(0), colour: P[0].name },
    sign: { bg: '#c3121e', band: '#f2f2ee', title: 'SABAR 600', sub: 'Garage Modou · Pikine', subColor: '#c3121e' },
  },
  branches: [{
    hub: 'plateau', name: 'Ndiaye Auto · Motos sportives', catalogue: 'motos', site: sabarNdiaye, paint: { seed: sabarSeedOf(1), colour: P[1].name },
    sign: { bg: '#17181b', band: '#f2b705', title: 'SABAR 600', sub: 'Ndiaye Auto · Plateau', subColor: '#17181b' },
  }],
  text: {
    mine: 'Ta Sabar 600', getOn: 'Monter sur la moto', getOff: 'Descendre de la moto',
    confirm: 'Acheter la Sabar 600 ?', delivered: 'Neuve, livrée au bord de la route, le plein fait',
    welcome: `La Sabar t’attend au bord de la route. ${say('Jërëjëf')} !`, parked: 'Moto garée.', owned: 'Elle est déjà à toi',
  },
  exit: 'left', reach: 1.9,
});
