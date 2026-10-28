import type { HubWorld } from '../world/types';
import type { CarModelId } from '../actors/vehicleKit';
import { vehicleSpec } from '../actors/vehicleKit';
import { glbVehicle, tintBody } from '../actors/glbVehicle';
import { kitCarSpec } from './car';
import { OwnedVehicleModule, kerbDealer, type DealerSite } from './ownedModule';
import { PrestigeSales } from './prestigeSales';
import { stockedShop, stockedShopFront } from '../world/shopKit';
import { NDIAYE_AUTO } from '../world/city';
import { COUNTER, FORECOURT_PARK, PRESTIGE_HUB, SLOTS } from '../world/prestige';
import { say } from '../i18n/wolof';
import type { VehicleSpec } from './spec';

/**
 * The player cars with a body of their own (public/assets/vehicles/<model>.glb, authored by scripts/vehicles/author: original designs, no badge,
 * no lettering), on the same owned-vehicle system as every other vehicle: a floor car is the very car tried, bought, parked, saved and driven.
 *   - « Teranga » (`teranga`): a modern five-door city hatch, two-tone with a black roof · the first car most players aim for (Sarr Auto, Pikine; Ndiaye Auto, Plateau)
 *   - « Rafet » (`rafet`): a sporty five-door hatch · Ndiaye Auto
 *   - « Lamane Sport » (`tout_terrain`): the luxury SUV, flagship of Prestige Auto (src/transport/premiumCars.ts: the asset kept its id, its owners keep their car)
 *   - « Gaïndé » (`gainde`): an SUV coupé · Prestige Auto
 * Prices are the catalogue's (src/economy/catalog.ts); handling numbers are PROVISIONAL like the others'.
 *
 * Paint: a model car's paint is a tint of its own body (src/actors/glbVehicle.ts `tintBody`: the paint only, never the glass, lamps or the black roof),
 * keyed by a seed 1000 + i that is saved with the car (src/transport/owned.ts `paintSeed`), the same number on every client.
 */
export interface Paint { name: string; hex: number }
export const PAINTS: Record<CarModelId, Paint[]> = {
  teranga: [{ name: 'blanc nacré', hex: 0xeceeed }, { name: 'gris argent', hex: 0xa7abb0 }, { name: 'bleu électrique', hex: 0x1e5fa8 }, { name: 'rouge', hex: 0xa3151c }],
  rafet: [{ name: 'jaune', hex: 0xf1bf17 }, { name: 'blanc', hex: 0xefefec }, { name: 'gris', hex: 0x5d6166 }, { name: 'bleu', hex: 0x1f6fb5 }],
  lamane: [{ name: 'rouge', hex: 0xc2141f }, { name: 'noir', hex: 0x16171a }, { name: 'blanc', hex: 0xf1f1ef }, { name: 'gris', hex: 0x7d8186 }],
  gainde: [{ name: 'blanc', hex: 0xf0f0ee }, { name: 'noir', hex: 0x141516 }, { name: 'bleu nuit', hex: 0x1d3557 }],
};
export const paintSeedOf = (i: number) => 1000 + i;
const KIND: Record<CarModelId, 'sedan' | 'suv'> = { teranga: 'sedan', rafet: 'sedan', lamane: 'suv', gainde: 'suv' };
/**
 * The paint of `seed`. A seed under 1000 is a kit seed saved before the model had a body of its own (a 4 × 4 bought white keeps a white
 * Lamane Sport): the paint nearest to that kit body's colour.
 */
export function paintOf(model: CarModelId, seed: number): Paint {
  const P = PAINTS[model];
  if (seed >= 1000) return P[seed - 1000] ?? P[0];
  const c = vehicleSpec(KIND[model], { seed, driver: false, passengers: false }).colors.body, ch = (h: number, k: number) => (h >> k) & 255;
  let best = P[0], bd = Infinity;
  for (const p of P) { const d = (ch(p.hex, 16) - ch(c, 16)) ** 2 + (ch(p.hex, 8) - ch(c, 8)) ** 2 + (ch(p.hex, 0) - ch(c, 0)) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}

/** The prepared body of a model car in the paint of `seed` (null: not loaded, the kit model of the same proportions stands in). */
export function modelVisual(model: CarModelId) {
  return (seed: number) => {
    const g = glbVehicle(model, vehicleSpec(KIND[model], { seed, driver: false, passengers: false, model }));
    if (g) tintBody(g, paintOf(model, seed).hex);
    return g;
  };
}

const specs = new Map<string, VehicleSpec>();
const modelSpec = (id: string, name: string, model: CarModelId, drive: Parameters<typeof kitCarSpec>[0]['drive']) => () => {
  let s = specs.get(id);
  if (!s) { s = kitCarSpec({ id, name, kind: KIND[model], seed: paintSeedOf(0), model, visual: modelVisual(model), openable: true, drive }); specs.set(id, s); }
  return s;
};
/** Nimble and light: quick off the line, a tight circle. */
export const terangaSpec = modelSpec('teranga', 'Teranga', 'teranga', { maxSpeed: 19, boostSpeed: 46, reverseSpeed: 3, accel: 4.2, brake: 7.6, turnRadius: 5.2, steer: 2.9, grip: 9.8 });
/** The sporty one: a little more of everything. */
export const rafetSpec = modelSpec('rafet', 'Rafet', 'rafet', { maxSpeed: 20, boostSpeed: 49, reverseSpeed: 3, accel: 4.6, brake: 7.9, turnRadius: 5.3, steer: 3.0, grip: 10.2 });
/** Heavy and steady (the luxury SUV's numbers). */
export const lamaneSpec = modelSpec('suv', 'Lamane Sport', 'lamane', { maxSpeed: 19.5, boostSpeed: 45, reverseSpeed: 3, accel: 3.8, brake: 7.4, turnRadius: 6.4, steer: 2.4, grip: 8.2 });
/** The coupé SUV: as heavy, a little quicker. */
export const gaindeSpec = modelSpec('gainde', 'Gaïndé', 'gainde', { maxSpeed: 20.5, boostSpeed: 51, reverseSpeed: 3, accel: 4.4, brake: 7.8, turnRadius: 6.2, steer: 2.5, grip: 8.8 });

// ------------------------------------------------------------------------------------------------ Ndiaye Auto (Plateau): the showroom's three lots
/** The showroom's lots, in order: 0 the modern sedan (src/transport/carModule.ts), 1 a Teranga, 2 a Rafet. */
export const NDIAYE_LOTS = { car: 0, teranga: 1, rafet: 2 } as const;
/** Ndiaye Auto's floor for one model: the real car on its lot, nose to the street, driven out through the open front; a phone purchase waits at the kerb. */
export function ndiayeFloor(lot: number, seed: number, colour: string) {
  return (hub: HubWorld): DealerSite | null => {
    const show = stockedShop(hub.group, NDIAYE_AUTO), l = show?.anchors.lots?.[lot], door = stockedShopFront(hub.group, NDIAYE_AUTO);
    if (!show || !l || !door) return null;
    const kerb = kerbDealer(door.x, door.z, { displays: [], delivery: 0, sign: 7.6, clear: [-10, 10] });
    return { ...kerb, counter: { x: show.anchors.counter.x, z: show.anchors.counter.z }, displays: [], floor: { slots: [{ x: l.x, z: l.z, yaw: l.yaw, seed, colour }] } };
  };
}
const NDIAYE_LOOK = { skin: 0x4e2e1c, style: 'tee' as const, top: 0xeef2f6, bottom: 0x1b2a3a, hat: null, shoes: 0x111214, muscular: 0.2 };
export const ndiayeSales = new PrestigeSales({
  key: 'ndiaye', hub: 'plateau', title: 'Ndiaye Auto', person: 'Moussa Ndiaye', look: NDIAYE_LOOK, hours: [8, 20],
  layout: hub => {
    const show = stockedShop(hub.group, NDIAYE_AUTO); if (!show) return null;
    const b = show.bounds, k = show.anchors.keeper;
    return {
      home: { x: k.x, z: k.z, yaw: k.yaw },
      grid: { x0: b.x0 - 16, x1: b.x1 + 16, z0: b.z0 - 16, z1: b.z1 + 16 },
      grounds: (x: number, z: number, pad = 0) => x > b.x0 - 7 - pad && x < b.x1 + 7 + pad && z > b.z0 - 7 - pad && z < b.z1 + 7 + pad,
    };
  },
  greetings: [
    { bubble: 'Bienvenue chez Ndiaye Auto !', say: () => `${say('Salaam aleekum')} ! Moussa Ndiaye. Regarde à ton aise : chaque voiture s’essaie, gratuitement.` },
    { bubble: 'Bonjour, je t’aide ?', say: () => `${say('Na nga def ?')} Dis-moi laquelle te plaît, j’apporte les clés.` },
  ],
  talkIntro: (_ctx, trial) => (trial ? `Alors, elle te plaît ? Ici c’est comptant, au prix affiché. ${say('Jërëjëf')}.` : `${say('Dalal ak jàmm')} chez Ndiaye Auto. Ici c’est comptant, au prix affiché.`),
});

// ------------------------------------------------------------------------------------------------ Sarr Auto (Pikine): the used-car lot at the kerb across from Garage Modou
/**
 * A lot on the south kerb of the road in front of Garage Modou (Pikine, road z = 0): the cars stand in the parking lane facing the traffic of that side,
 * Pape Sarr's desk under a tarp on the pavement, his hand-painted board. Pure numbers (src/transport/sarrAuto.ts dresses it; the cars are the vehicle modules').
 */
export const SARR_HUB = 'pikine' as const;
export function sarrLot() {
  const k = kerbDealer(89, 6.2, { displays: [{ along: -8.2, seed: 0 }, { along: -1.6, seed: 0 }, { along: 5.0, seed: 0 }, { along: 11.4, seed: 0 }], delivery: 20.5, sign: -12.6, desk: true, clear: [-14, 24] });
  const xs = k.displays.map(d => d.x), zs = k.displays.map(d => d.z);
  return {
    ...k,
    /** Slots, west to east: 0 and 1 the Teranga on sale, 2 a used saloon already sold (decor), 3 a Jakarta (Garage Modou's, decor). */
    slots: k.displays.map(d => ({ x: d.x, z: d.z, yaw: d.yaw })),
    bounds: { x0: Math.min(...xs) - 5, x1: Math.max(...xs) + 9, z0: Math.min(...zs) - 3.5, z1: Math.max(...zs) + 5 },
  };
}
export function sarrFloor(slot: number, seed: number, colour: string) {
  return (hub: HubWorld): DealerSite | null => {
    if (hub.id !== SARR_HUB) return null;
    const L = sarrLot(), s = L.slots[slot];
    return { counter: L.counter, sign: L.sign, displays: [], delivery: L.delivery, kerb: L.kerb, floor: { slots: [{ ...s, seed, colour }] } };
  };
}
const SARR_LOOK = { skin: 0x5b3420, style: 'boubou' as const, top: 0x2f5f86, bottom: 0x2f5f86, pattern: 'bazin' as const, hat: 'kufi' as const, hatColor: 0xeee8da, shoes: 0x3a2a1c, heavy: 0.35, beard: 0x2a2420 };
/** Pape Sarr, the lot's owner. His errands and his credit are src/transport/sarrAuto.ts's (`relationship`). */
export const sarrSales = new PrestigeSales({
  key: 'sarr', hub: SARR_HUB, title: 'Sarr Auto', person: 'Pape Sarr', look: SARR_LOOK, hours: [8, 19],
  layout: hub => {
    if (hub.id !== SARR_HUB) return null;
    const L = sarrLot(), b = L.bounds, d = L.desk ?? { x: L.counter.x, z: L.counter.z, yaw: 0 };
    return {
      home: { x: d.x + (L.counter.x - d.x) * -0.9, z: d.z + (L.counter.z - d.z) * -0.9, yaw: Math.atan2(L.counter.x - d.x, L.counter.z - d.z) },
      grid: { x0: b.x0 - 14, x1: b.x1 + 14, z0: b.z0 - 14, z1: b.z1 + 10 },
      grounds: (x: number, z: number, pad = 0) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad,
    };
  },
  greetings: [
    { bubble: 'Salaam aleekum !', say: () => `${say('Salaam aleekum')} ! Pape Sarr. Des voitures sérieuses, des prix de Pikine. Regarde, essaie.` },
    { bubble: 'Bienvenue chez Sarr Auto', say: () => `${say('Na nga def ?')} Viens voir la Teranga : la première voiture de tout le quartier.` },
  ],
});

// ------------------------------------------------------------------------------------------------ the modules
const PRESTIGE_SIGN = { bg: '#1c1d21', band: '#c9a227', title: 'PRESTIGE', sub: 'Prestige Auto · Almadies', subColor: '#1c1d21' };
const NDIAYE_SIGN = { bg: '#1b2a7a', band: '#f4c20d', title: 'VOITURES', sub: 'Ndiaye Auto · Plateau', subColor: '#1b2a7a' };
const SARR_SIGN = { bg: '#2f5f86', band: '#f2c94c', title: 'SARR AUTO', sub: 'Voitures d’occasion · Pikine', subColor: '#2f5f86' };
const CAR_TEXT = (name: string, f: boolean) => ({
  mine: f ? `Ta ${name}` : `Ton ${name}`, getOn: 'Monter (conducteur)', getOff: 'Sortir de la voiture',
  confirm: `Acheter ${f ? 'la' : 'le'} ${name} ?`, delivered: 'Cette voiture-là, là où elle est : tu repars avec',
  welcome: `Les clés sont à toi. ${say('Jërëjëf')} !`, parked: 'Voiture garée.', owned: f ? 'Elle est déjà à toi' : 'Il est déjà à toi',
});

/** Prestige Auto's floor for one model (the hall of src/world/prestige.ts: its slots for that model, in order). */
export function prestigeFloor(model: 'berline' | 'suv' | 'gainde', seeds: number[], colours: string[]) {
  return (hub: HubWorld): DealerSite | null => {
    if (hub.id !== PRESTIGE_HUB) return null;
    const slots = SLOTS.filter(s => s.model === model).map((s, i) => ({ x: s.x, z: s.z, yaw: s.yaw, seed: seeds[i], colour: colours[i] }));
    return { counter: { ...COUNTER }, sign: { ...COUNTER, yaw: 0 }, displays: [], delivery: { ...FORECOURT_PARK }, kerb: [{ x: -86, z: 4.3, dx: 1, dz: 0, rx: 0, rz: 1, offset: 4.3, from: -17, to: 17 }], floor: { slots } };
  };
}

const T = PAINTS.teranga;
export const teranga = new OwnedVehicleModule({
  key: 'teranga', asset: 'teranga', detail: 'Citadine moderne · 5 portes · 5 places · idéale pour les courses VTC', icon: '🚗', kit: 'sedan',
  seed: () => paintSeedOf(0), spec: terangaSpec, visual: modelVisual('teranga'), height: 1.5, space: 'car:teranga',
  dealer: { hub: 'pikine', name: 'Sarr Auto', catalogue: 'voitures', site: sarrFloorBoth(), sign: SARR_SIGN, sales: sarrSales, counterBias: 2.5 },   // Pape Sarr himself wins the prompt at his desk; the till only when he is away
  branches: [{ hub: 'plateau', name: 'Ndiaye Auto', catalogue: 'voitures', site: ndiayeFloor(NDIAYE_LOTS.teranga, paintSeedOf(2), T[2].name), sign: NDIAYE_SIGN, sales: ndiayeSales }],
  text: CAR_TEXT('Teranga', true), exit: 'pavement', reach: 1.4,
});
/** Sarr Auto has two Teranga on its kerb: the white one with its black roof, and a silver one. */
function sarrFloorBoth() {
  const a = sarrFloor(0, paintSeedOf(0), T[0].name), b = sarrFloor(1, paintSeedOf(1), T[1].name);
  return (hub: HubWorld): DealerSite | null => { const x = a(hub), y = b(hub); return x && y ? { ...x, floor: { slots: [...x.floor!.slots, ...y.floor!.slots] } } : null; };
}

export const rafet = new OwnedVehicleModule({
  key: 'rafet', asset: 'rafet', detail: 'Citadine sportive · 5 portes · 5 places', icon: '🚗', kit: 'sedan',
  seed: () => paintSeedOf(0), spec: rafetSpec, visual: modelVisual('rafet'), height: 1.45, space: 'car:rafet',
  dealer: { hub: 'plateau', name: 'Ndiaye Auto', catalogue: 'voitures', site: ndiayeFloor(NDIAYE_LOTS.rafet, paintSeedOf(0), PAINTS.rafet[0].name), sign: NDIAYE_SIGN, sales: ndiayeSales },
  text: CAR_TEXT('Rafet', true), exit: 'pavement', reach: 1.4,
});

export const gainde = new OwnedVehicleModule({
  key: 'gainde', asset: 'gainde', detail: 'SUV coupé · 5 places · se gare où tu le laisses', icon: '🚙', kit: 'suv',
  seed: () => paintSeedOf(0), spec: gaindeSpec, visual: modelVisual('gainde'), height: 1.7, space: 'car:gainde',
  dealer: { hub: 'almadies', name: 'Prestige Auto · SUV coupé', catalogue: 'suv-coupes', site: prestigeFloor('gainde', [paintSeedOf(2), paintSeedOf(0)], [PAINTS.gainde[2].name, PAINTS.gainde[0].name]), sign: PRESTIGE_SIGN },
  text: CAR_TEXT('Gaïndé', false), exit: 'pavement', reach: 1.6,
});
