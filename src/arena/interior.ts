import type { GameModule } from '../game/modules';
import { fightNight } from './people';

/**
 * The inside of the Pikine arena. The structure is drawn by the builder from src/world/arenaModules.ts: stands of eight
 * sections between six aisles with stairs, the wrestlers' tunnel and their own gate, the drummers' deck, the media zone,
 * the officials' table, each écurie's preparation corner on its wrestler's side. Every person inside the walls on a
 * fight night — officials, judges, referee, the drummers' group, press, vendors, each wrestler's entourage — belongs to
 * src/arena/people.ts, driven by the arena evening (src/arena/module.ts). This module keeps the debug view of who is in.
 */
export const arenaInteriorModule: GameModule = {
  name: 'arenaInterior',
  debug: () => ({
    /** The people inside the walls: shown (the fight night's moment), drawn near the camera, by role. */
    arenaIn: () => fightNight.current?.inside() ?? null,
    /** Force the people inside in (as if the doors were open) or out; null: follow the evening. */
    arenaInForce: (v: boolean | null) => { if (fightNight.current) fightNight.current.force = v; },
  }),
};
