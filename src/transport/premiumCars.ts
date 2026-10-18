import type { HubWorld } from '../world/types';
import { kitCarSpec, kitSeedFor } from './car';
import { OwnedVehicleModule, kerbDealer, type DealerSite } from './ownedModule';
import { say } from '../i18n/wolof';

/**
 * The two upper rungs of the player's cars, on the same owned-vehicle system as the Jakarta and the Berline moderne (src/transport/ownedModule.ts:
 * dealer, price shown then confirmed, paid once through the asset model, delivered at the kerb, driven, parked where it is left, saved).
 * « Berline neuve » (`berline`) and « 4 × 4 de luxe » (`tout_terrain`) wear the shared kit's `luxury` saloon and `suv` for now: the bodies of Stages B
 * and C of docs/assets/VEHICLE_LINEUP.md (generated, then fitted by scripts/vehicles/prepare-vehicle-glb.mjs) take over through `visual` when they
 * exist, and nothing else changes. Prices and handling are PROVISIONAL until the economy balance pass.
 *
 * « Prestige Auto » (fictional): two corners on the plaza's road in the Almadies, one on each pavement, facing each other across the road.
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
  id: 'berline', name: 'Berline neuve', kind: 'luxury', seed: berlineSeed(),
  drive: { maxSpeed: 19.5, reverseSpeed: 3, accel: 3.4, brake: 7.2, turnRadius: 6, steer: 2.5 },
}));
/** The heaviest: slower to pick up, the widest circle. */
export const suvSpec = () => (suvCache ??= kitCarSpec({
  id: 'suv', name: '4 × 4 de luxe', kind: 'suv', seed: suvSeed(),
  drive: { maxSpeed: 17.5, reverseSpeed: 3, accel: 2.6, brake: 6.6, turnRadius: 6.4, steer: 2.4 },
}));

/** Where the corners stand (hub-local x on the road z = 0, the plaza side of the Almadies). */
export const PRESTIGE = { x: -92, z: 6 } as const;

/** A pavement dealer on the road z = 0: `side` +1 is the plaza's pavement, −1 the one across; two cars on show behind the desk, the bought one ahead. */
function prestigeDealer(side: 1 | -1, seeds: [number, number]) {
  return (hub: HubWorld): DealerSite | null => {
    if (hub.id !== 'almadies') return null;
    return kerbDealer(PRESTIGE.x, side * PRESTIGE.z, { displays: [{ along: -6, seed: seeds[0] }, { along: -11.5, seed: seeds[1] }], delivery: 6.5, sign: 2.4, desk: true, clear: [-16, 12] });
  };
}

export const berline = new OwnedVehicleModule({
  key: 'berline', asset: BERLINE_ASSET, detail: BERLINE_DETAIL, icon: '🚘', kit: 'luxury',
  seed: () => berlineSeed(), spec: berlineSpec, height: 1.5, space: 'car:berline',
  dealer: {
    hub: 'almadies', name: 'Prestige Auto · Berlines', catalogue: 'berlines', site: prestigeDealer(1, [berlineSeed(BERLINE_WHITE), berlineSeed(BERLINE_NAVY)]),
    sign: { bg: '#1c1d21', band: '#c9a227', title: 'BERLINES', sub: 'Prestige Auto · Almadies', subColor: '#1c1d21' },
  },
  text: {
    mine: 'Ta berline', getOn: 'Monter (conducteur)', getOff: 'Sortir de la voiture',
    confirm: 'Acheter la berline neuve ?', delivered: 'Elle t’attendra devant le showroom, prête à rouler',
    welcome: `Le vendeur te tend les clés : « Elle t’attend devant la porte. ${say('Jërëjëf')} ! »`, parked: 'Voiture garée.', owned: 'Elle est déjà à toi',
  },
  exit: 'pavement', reach: 1.4,
});

export const suv = new OwnedVehicleModule({
  key: 'suv', asset: SUV_ASSET, detail: SUV_DETAIL, icon: '🚙', kit: 'suv',
  seed: () => suvSeed(), spec: suvSpec, height: 1.95, space: 'car:tout_terrain',
  dealer: {
    hub: 'almadies', name: 'Prestige Auto · 4 × 4', catalogue: 'tout-terrains', site: prestigeDealer(-1, [suvSeed(SUV_WHITE), suvSeed(SUV_GREEN)]),
    sign: { bg: '#1c1d21', band: '#c9a227', title: '4 × 4 DE LUXE', sub: 'Prestige Auto · Almadies', subColor: '#1c1d21' },
  },
  text: {
    mine: 'Ton 4 × 4', getOn: 'Monter (conducteur)', getOff: 'Sortir du 4 × 4',
    confirm: 'Acheter le 4 × 4 de luxe ?', delivered: 'Il t’attendra devant le showroom, prêt à rouler',
    welcome: `Le vendeur te tend les clés : « Il t’attend devant la porte. ${say('Jërëjëf')} ! »`, parked: '4 × 4 garé.', owned: 'Il est déjà à toi',
  },
  exit: 'pavement', reach: 1.6,
});
