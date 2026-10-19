import type { GameCtx } from '../game/modules';
import type { HubId } from '../core/types';
import { moto } from './motoModule';
import { car } from './carModule';
import { berline, suv } from './premiumCars';

/** A vehicle dealer as the phone's Carte lists it (every district, visited or not): where it is and what it sells. */
export interface DealerRow { id: string; name: string; hub: HubId; vehicle: string; icon: string; price: number; owned: boolean }

/** The four dealers, nearest to a beginner's wallet first. */
export function dealerDirectory(state: GameCtx['state']): DealerRow[] {
  return [moto, car, berline, suv].map(m => m.directoryRow(state)).filter((r): r is DealerRow => !!r);
}
