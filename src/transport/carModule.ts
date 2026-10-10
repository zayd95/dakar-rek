import type { HubWorld } from '../world/types';
import { carSpec, sedanSeed, CAR_ASSET, CAR_DETAIL, SEDAN_BLUE, SEDAN_WHITE } from './car';
import { OwnedVehicleModule, kerbDealer, type DealerSite } from './ownedModule';
import { stockedShopFront } from '../world/shopKit';

/**
 * The player's car: the catalogue's « Voiture d'occasion » (`clando`, a used kit saloon) bought at « Voitures
 * d'occasion · Ndiaye Auto » (fictional), a used-car corner on the pavement of the Plateau, beside Dakar Réparation.
 * Price shown (the catalogue's), then confirmed, paid once through the asset model; delivered at the kerb.
 * « Monter (conducteur) » on the driver seat, drive (the motorbike's controls, car handling), « Sortir de la voiture »
 * on the pavement side; it stays parked where you leave it, in that hub, across reloads.
 * src/transport/ownedModule.ts does the work; src/transport/owned.ts keeps where it is parked.
 */
function carDealer(hub: HubWorld): DealerSite | null {
  const shop = hub.interactables.find(i => i.id === 'plateau:city:salon-tech');
  if (!shop) return null;
  // the pavement in front of the shop (its sheet stands at the counter inside since the shop kit: src/world/shopKit.ts)
  const p = stockedShopFront(hub.group, shop.id) ?? shop;
  // on the pavement of the road east of the shops block: two cars for sale behind the desk, the bought one ahead
  return kerbDealer(p.x, p.z, {
    displays: [{ along: -6, seed: sedanSeed(SEDAN_WHITE) }, { along: -11.5, seed: sedanSeed(SEDAN_BLUE) }],
    delivery: 6.5, sign: 2.4, desk: true, clear: [-16, 12],
  });
}

export const car = new OwnedVehicleModule({
  key: 'car', asset: CAR_ASSET, detail: CAR_DETAIL, icon: '🚗', kit: 'sedan',
  seed: () => sedanSeed(), spec: carSpec, height: 1.45, space: 'car:berline',
  dealer: {
    hub: 'plateau', name: 'Voitures d’occasion · Ndiaye Auto', catalogue: 'voitures', site: carDealer,
    sign: { bg: '#1b2a7a', band: '#f4c20d', title: 'OCCASIONS', sub: 'Ndiaye Auto · Plateau', subColor: '#1b2a7a' },
  },
  text: {
    mine: 'Ta voiture', getOn: 'Monter (conducteur)', getOff: 'Sortir de la voiture',
    confirm: 'Acheter la voiture d’occasion ?', delivered: 'Livrée au bord du trottoir, prête à rouler',
    welcome: 'Ta voiture t’attend au bord du trottoir. Jërëjëf !', parked: 'Voiture garée.', owned: 'Elle est déjà à toi',
  },
  exit: 'pavement', reach: 1.4,
});
