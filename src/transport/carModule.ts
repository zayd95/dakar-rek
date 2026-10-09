import type { HubWorld } from '../world/types';
import { carSpec, sedanSeed, CAR_CATALOGUE, SEDAN_BLUE, SEDAN_WHITE } from './car';
import { OwnedVehicleModule, kerbDealer, type DealerSite } from './ownedModule';

/**
 * The player's car: a used saloon bought at « Voitures d'occasion · Ndiaye Auto » (fictional), a used-car corner on
 * the pavement of the Plateau, beside Dakar Réparation. Price shown, then confirmed, paid once; delivered at the kerb.
 * « Monter (conducteur) » on the driver seat, drive (the motorbike's controls, car handling), « Sortir de la voiture »
 * on the pavement side; it stays parked where you leave it, in that hub, across reloads.
 * src/transport/ownedModule.ts does the work; ownership through src/transport/owned.ts (`car_sedan`).
 */
function carDealer(hub: HubWorld): DealerSite | null {
  const shop = hub.interactables.find(i => i.id === 'plateau:city:salon-tech');
  if (!shop) return null;
  // on the pavement of the road east of the shops block: two cars for sale behind the desk, the bought one ahead
  return kerbDealer(shop.x, shop.z, {
    displays: [{ along: -6, seed: sedanSeed(SEDAN_WHITE) }, { along: -11.5, seed: sedanSeed(SEDAN_BLUE) }],
    delivery: 6.5, sign: 2.4, desk: true, clear: [-16, 12],
  });
}

export const car = new OwnedVehicleModule({
  key: 'car', id: CAR_CATALOGUE.id, item: CAR_CATALOGUE, icon: '🚗', kit: 'sedan',
  seed: () => sedanSeed(), spec: carSpec, height: 1.45, space: 'car:berline',
  dealer: {
    hub: 'plateau', name: 'Voitures d’occasion · Ndiaye Auto', catalogue: 'voitures', site: carDealer,
    sign: { bg: '#1b2a7a', band: '#f4c20d', title: 'OCCASIONS', sub: 'Ndiaye Auto · Plateau', subColor: '#1b2a7a' },
  },
  text: {
    mine: 'Ta berline', getOn: 'Monter (conducteur)', getOff: 'Sortir de la voiture',
    confirm: 'Acheter la berline d’occasion ?', delivered: 'Livrée au bord du trottoir, prête à rouler',
    welcome: 'Ta berline t’attend au bord du trottoir. Jërëjëf !', parked: 'Voiture garée.', owned: 'Elle est déjà à toi',
  },
  exit: 'pavement', reach: 1.4,
});
