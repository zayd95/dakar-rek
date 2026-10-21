import type { GameCtx } from '../game/modules';
import type { HubId } from '../core/types';
import { OWNED_VEHICLES } from './fleet';

/** A vehicle dealer as the phone's Carte lists it (every district, visited or not): where it is and what it sells. */
export interface DealerRow { id: string; name: string; hub: HubId; vehicle: string; icon: string; price: number; owned: boolean }

/** Every dealership of every model (a model sold in two districts has two rows), nearest to a beginner's wallet first. */
export function dealerDirectory(state: GameCtx['state']): DealerRow[] {
  return OWNED_VEHICLES.flatMap(m => m.directoryRows(state));
}
