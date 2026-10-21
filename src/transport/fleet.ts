import { moto } from './motoModule';
import { car } from './carModule';
import { berline, suv } from './premiumCars';
import { gainde, rafet, teranga } from './modelCars';
import type { VehicleAsset } from './owned';

/**
 * Every vehicle the player can own, cheapest first: one owned-vehicle module each (src/transport/ownedModule.ts). The lists that walk the
 * player's vehicles (the garage's bay, the evening planner, the phone's map and dealer directory) read this one.
 */
export const CARS = [teranga, rafet, car, berline, gainde, suv] as const;
export const OWNED_VEHICLES = [moto, ...CARS] as const;
/** What each module is called when the planner points at it, and its catalogue id. */
export const VEHICLE_LABELS: { key: string; asset: VehicleAsset; label: string; mod: (typeof OWNED_VEHICLES)[number]; f: boolean }[] = [
  { key: 'moto', asset: 'jakarta', label: 'Ta moto Jakarta', mod: moto, f: true },
  { key: 'teranga', asset: 'teranga', label: 'Ta Teranga', mod: teranga, f: true },
  { key: 'rafet', asset: 'rafet', label: 'Ta Rafet', mod: rafet, f: true },
  { key: 'car', asset: 'compacte', label: 'Ta voiture', mod: car, f: true },
  { key: 'berline', asset: 'berline', label: 'Ta berline', mod: berline, f: true },
  { key: 'gainde', asset: 'gainde', label: 'Ton Gaïndé', mod: gainde, f: false },
  { key: 'suv', asset: 'tout_terrain', label: 'Ton Lamane Sport', mod: suv, f: false },
];
