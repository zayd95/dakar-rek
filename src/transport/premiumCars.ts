import { kitCarSpec, kitSeedFor } from './car';
import { OwnedVehicleModule } from './ownedModule';
import { say } from '../i18n/wolof';
import { lamaneSpec, modelVisual, paintSeedOf, PAINTS, prestigeFloor } from './modelCars';

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
export const SUV_DETAIL = 'Grand SUV de luxe · 5 places · toit noir flottant · se gare où tu le laisses';

let berlineCache: ReturnType<typeof kitCarSpec> | null = null, suvCache: ReturnType<typeof kitCarSpec> | null = null;
/** A little faster and softer than the modern sedan. */
export const berlineSpec = () => (berlineCache ??= kitCarSpec({
  id: 'berline', name: 'Berline neuve', kind: 'luxury', seed: berlineSeed(), openable: true,
  drive: { maxSpeed: 21, boostSpeed: 32, reverseSpeed: 3, accel: 4.6, brake: 8, turnRadius: 6, steer: 2.7, grip: 10 },
}));
/** The heaviest: slower to pick up, the widest circle. Its body is the Lamane Sport's own (src/transport/modelCars.ts). */
export const suvSpec = lamaneSpec;
void suvCache;

/**
 * The dealership: one hall on a parcel of its own (src/world/prestige.ts, block (0, 2) of the Almadies), four real cars on its floor, each in its own paint:
 * the saloon, two Lamane Sport (the red flagship and a black one), the Gaïndé (src/transport/modelCars.ts). A car on the floor is the one the player
 * test-drives and buys, where it stands (src/transport/ownedModule.ts, src/transport/prestigeSales.ts).
 */

export const berline = new OwnedVehicleModule({
  key: 'berline', asset: BERLINE_ASSET, detail: BERLINE_DETAIL, icon: '🚘', kit: 'luxury',
  seed: () => berlineSeed(), spec: berlineSpec, height: 1.5, space: 'car:berline',
  dealer: {
    hub: 'almadies', name: 'Prestige Auto · Berlines', catalogue: 'berlines', site: prestigeFloor('berline', [berlineSeed(BERLINE_WHITE)], ['blanche']),
    sign: { bg: '#1c1d21', band: '#c9a227', title: 'BERLINES', sub: 'Prestige Auto · Almadies', subColor: '#1c1d21' }, counterBias: -0.2,
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
  seed: () => paintSeedOf(0), spec: suvSpec, visual: modelVisual('lamane'), height: 1.85, space: 'car:tout_terrain',
  dealer: {
    hub: 'almadies', name: 'Prestige Auto · Lamane Sport', catalogue: 'tout-terrains', site: prestigeFloor('suv', [paintSeedOf(0), paintSeedOf(1)], [PAINTS.lamane[0].name, PAINTS.lamane[1].name]),
    sign: { bg: '#1c1d21', band: '#c9a227', title: 'LAMANE SPORT', sub: 'Prestige Auto · Almadies', subColor: '#1c1d21' },
  },
  text: {
    mine: 'Ton Lamane Sport', getOn: 'Monter (conducteur)', getOff: 'Sortir du SUV',
    confirm: 'Acheter le Lamane Sport ?', delivered: 'Cette voiture-là, là où elle est : tu repars avec',
    welcome: `Le vendeur te tend les clés : « Il t’attend devant la porte. ${say('Jërëjëf')} ! »`, parked: 'SUV garé.', owned: 'Il est déjà à toi',
  },
  exit: 'pavement', reach: 1.6,
});
