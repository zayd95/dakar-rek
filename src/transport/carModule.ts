import type { HubWorld } from '../world/types';
import { carSpec, sedanSeed, CAR_ASSET, CAR_DETAIL, SEDAN_BLUE, SEDAN_WHITE } from './car';
import { OwnedVehicleModule, kerbDealer, type DealerSite } from './ownedModule';
import { stockedShop, stockedShopFront } from '../world/shopKit';
import { NDIAYE_AUTO } from '../world/city';
import { say } from '../i18n/wolof';

/**
 * The player's car: the catalogue's « Voiture d'occasion » (`clando`, a used kit saloon) bought at « Voitures
 * d'occasion · Ndiaye Auto » (fictional), a small used-car showroom of the Plateau open on the road east of the shops
 * block (src/world/city.ts, the shop kit's `showroom_cars`): three saloons on their lots, the silver one for sale with
 * its price card (the catalogue's price), the two others already taken; the salesman's desk at the back, the keys on
 * the board behind him. At the desk: the price shown (the catalogue's), then confirmed, paid once through the asset
 * model. The silver saloon leaves its lot and waits at the kerb outside the door; the salesman hands over the keys.
 * « Monter (conducteur) » on the driver seat, drive (the motorbike's controls, car handling), « Sortir de la voiture »
 * on the pavement side; it stays parked where you leave it, in that hub, across reloads.
 * src/transport/ownedModule.ts does the work; src/transport/owned.ts keeps where it is parked.
 */
export function carDealer(hub: HubWorld): DealerSite | null {
  const show = stockedShop(hub.group, NDIAYE_AUTO), lot = show?.anchors.lots?.[0], door = stockedShopFront(hub.group, NDIAYE_AUTO);
  if (show && lot && door) {
    // the pavement before the open front: the bought car waits at the kerb right there, the pole sign by the corner
    const kerb = kerbDealer(door.x, door.z, { displays: [], delivery: 0, sign: 7.6, clear: [-9, 9] });
    return {
      ...kerb, counter: { x: show.anchors.counter.x, z: show.anchors.counter.z },
      displays: [{ x: lot.x, z: lot.z, yaw: lot.yaw, seed: sedanSeed() }], forSale: 0, card: lot.card, lots: show.anchors.lots!.length,
    };
  }
  // without the showroom (another layout): the used-car corner on the pavement by Dakar Réparation, as before
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

/** The salesman hands over the keys (Wolof with its French gloss, src/i18n/wolof.ts). */
export const KEYS_LINE = `Moussa Ndiaye te tend les clés : « Elle t’attend devant la porte. ${say('Jërëjëf')} ! ${say('Ñibbil ak jàmm')} ! »`;

export const car = new OwnedVehicleModule({
  key: 'car', asset: CAR_ASSET, detail: CAR_DETAIL, icon: '🚗', kit: 'sedan',
  seed: () => sedanSeed(), spec: carSpec, height: 1.45, space: 'car:berline',
  dealer: {
    hub: 'plateau', name: 'Voitures d’occasion · Ndiaye Auto', catalogue: 'voitures', site: carDealer,
    sign: { bg: '#1b2a7a', band: '#f4c20d', title: 'OCCASIONS', sub: 'Ndiaye Auto · Plateau', subColor: '#1b2a7a' },
  },
  text: {
    mine: 'Ta voiture', getOn: 'Monter (conducteur)', getOff: 'Sortir de la voiture',
    confirm: 'Acheter la voiture d’occasion ?', delivered: 'Elle t’attendra devant la porte, prête à rouler',
    welcome: KEYS_LINE, parked: 'Voiture garée.', owned: 'Elle est déjà à toi',
  },
  exit: 'pavement', reach: 1.4,
});
