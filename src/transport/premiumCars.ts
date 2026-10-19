import type { HubWorld } from '../world/types';
import { kitCarSpec, kitSeedFor } from './car';
import { OwnedVehicleModule, type DealerSite } from './ownedModule';
import { say } from '../i18n/wolof';
import { COUNTER, FORECOURT_PARK, PRESTIGE_HUB, SLOTS } from '../world/prestige';

/**
 * The two upper rungs of the player's cars, on the same owned-vehicle system as the Jakarta and the Berline moderne (src/transport/ownedModule.ts:
 * dealer, price shown then confirmed, paid once through the asset model, delivered at the kerb, driven, parked where it is left, saved).
 * « Berline neuve » (`berline`) and « 4 × 4 de luxe » (`tout_terrain`) wear the shared kit's `luxury` saloon and `suv` for now: the bodies of Stages B
 * and C of docs/assets/VEHICLE_LINEUP.md (generated, then fitted by scripts/vehicles/prepare-vehicle-glb.mjs) take over through `visual` when they
 * exist, and nothing else changes. Prices and handling are PROVISIONAL until the economy balance pass.
 *
 * « Prestige Auto » (fictional): a glass showroom on its own parcel of the Almadies (src/world/prestige.ts), with a salesperson (src/transport/prestigeSales.ts).
 */

export const BERLINE_ASSET = 'berline' as const, SUV_ASSET = 'tout_terrain' as const;
/** Kit body colours: the one sold, then the two on display. */
export const BERLINE_GRAPHITE = 0x16181b, BERLINE_WHITE = 0xeeeeec, BERLINE_NAVY = 0x1b2a4a;
export const SUV_BLACK = 0x1a1b1d, SUV_WHITE = 0xf2f2f0, SUV_GREEN = 0x2f4a33;
export const berlineSeed = (c = BERLINE_GRAPHITE) => kitSeedFor('luxury', c);
export const suvSeed = (c = SUV_BLACK) => kitSeedFor('suv', c);

export const BERLINE_DETAIL = 'Modèle provisoire · 4 portes · 5 places · se gare où tu la laisses';
export const SUV_DETAIL = 'Modèle provisoire · 5 places · se gare où tu le laisses';

let berlineCache: ReturnType<typeof kitCarSpec> | null = null, suvCache: ReturnType<typeof kitCarSpec> | null = null;
/** A little faster and softer than the modern sedan. */
export const berlineSpec = () => (berlineCache ??= kitCarSpec({
  id: 'berline', name: 'Berline neuve', kind: 'luxury', seed: berlineSeed(), openable: true,
  drive: { maxSpeed: 19.5, reverseSpeed: 3, accel: 3.4, brake: 7.2, turnRadius: 6, steer: 2.5 },
}));
/** The heaviest: slower to pick up, the widest circle. */
export const suvSpec = () => (suvCache ??= kitCarSpec({
  id: 'suv', name: '4 × 4 de luxe', kind: 'suv', seed: suvSeed(), openable: true,
  drive: { maxSpeed: 17.5, reverseSpeed: 3, accel: 2.6, brake: 6.6, turnRadius: 6.4, steer: 2.4 },
}));

/**
 * The dealership: one hall on a parcel of its own (src/world/prestige.ts, block (0, 2) of the Almadies), four real cars on its floor, two of each model, each in
 * its own paint. A car on the floor is the one the player test-drives and buys, where it stands (src/transport/ownedModule.ts, src/transport/prestigeSales.ts).
 */
function prestigeFloor(model: 'berline' | 'suv', seeds: number[], colours: string[]) {
  return (hub: HubWorld): DealerSite | null => {
    if (hub.id !== PRESTIGE_HUB) return null;
    const slots = SLOTS.filter(s => s.model === model).map((s, i) => ({ x: s.x, z: s.z, yaw: s.yaw, seed: seeds[i], colour: colours[i] }));
    // the phone's order for a car bought elsewhere is delivered on the forecourt, clear of the bay
    return { counter: { ...COUNTER }, sign: { ...COUNTER, yaw: 0 }, displays: [], delivery: { ...FORECOURT_PARK }, kerb: [], floor: { slots } };
  };
}

export const berline = new OwnedVehicleModule({
  key: 'berline', asset: BERLINE_ASSET, detail: BERLINE_DETAIL, icon: '🚘', kit: 'luxury',
  seed: () => berlineSeed(), spec: berlineSpec, height: 1.5, space: 'car:berline',
  dealer: {
    hub: 'almadies', name: 'Prestige Auto · Berlines', catalogue: 'berlines', site: prestigeFloor('berline', [berlineSeed(BERLINE_WHITE), berlineSeed(BERLINE_NAVY)], ['blanche', 'bleu nuit']),
    sign: { bg: '#1c1d21', band: '#c9a227', title: 'BERLINES', sub: 'Prestige Auto · Almadies', subColor: '#1c1d21' },
  },
  text: {
    mine: 'Ta berline', getOn: 'Monter (conducteur)', getOff: 'Sortir de la voiture',
    confirm: 'Acheter la berline neuve ?', delivered: 'Cette voiture-là, là où elle est : tu repars avec',
    welcome: `Le vendeur te tend les clés : « Elle t’attend devant la porte. ${say('Jërëjëf')} ! »`, parked: 'Voiture garée.', owned: 'Elle est déjà à toi',
  },
  exit: 'pavement', reach: 1.4,
});

export const suv = new OwnedVehicleModule({
  key: 'suv', asset: SUV_ASSET, detail: SUV_DETAIL, icon: '🚙', kit: 'suv',
  seed: () => suvSeed(), spec: suvSpec, height: 1.95, space: 'car:tout_terrain',
  dealer: {
    hub: 'almadies', name: 'Prestige Auto · 4 × 4', catalogue: 'tout-terrains', site: prestigeFloor('suv', [suvSeed(SUV_WHITE), suvSeed(SUV_GREEN)], ['blanc', 'vert forêt']),
    sign: { bg: '#1c1d21', band: '#c9a227', title: '4 × 4 DE LUXE', sub: 'Prestige Auto · Almadies', subColor: '#1c1d21' },
  },
  text: {
    mine: 'Ton 4 × 4', getOn: 'Monter (conducteur)', getOff: 'Sortir du 4 × 4',
    confirm: 'Acheter le 4 × 4 de luxe ?', delivered: 'Cette voiture-là, là où elle est : tu repars avec',
    welcome: `Le vendeur te tend les clés : « Il t’attend devant la porte. ${say('Jërëjëf')} ! »`, parked: '4 × 4 garé.', owned: 'Il est déjà à toi',
  },
  exit: 'pavement', reach: 1.6,
});
