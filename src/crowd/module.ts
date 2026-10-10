import type { GameModule } from '../game/modules';
import { LIVE_CROWDS } from './crowd';
import { ArenaArrivals } from './arrivals';
import { REACTION_KINDS, type ReactionKind } from './reactions';

let arrivals: ArenaArrivals | null = null;

/**
 * The crowd lane's module (docs/CROWD.md). Owners make their own crowds (the arena's stands in src/arena/module.ts); this
 * module runs the fans arriving at the arena on fight evenings (src/crowd/arrivals.ts) and the debug entries the checks read.
 */
export const crowdModule: GameModule = {
  name: 'crowd',
  hubLoaded(ctx, hub) {
    arrivals?.dispose(); arrivals = null;
    if (hub.arena && hub.id === 'pikine') arrivals = new ArenaArrivals(ctx, hub);
  },
  update(_ctx, dt) { arrivals?.update(dt); },
  debug: () => ({
    arrivals: {
      info: () => arrivals?.info() ?? null,
      /** A taxi now on route r (0 west road, 1 east road). */
      taxi: (r?: number) => arrivals?.taxi(r) ?? false,
    },
    crowds: {
      /** Every live crowd: who is shown at which level of detail, who reacts, the draw calls it costs. */
      list: () => [...LIVE_CROWDS].map(c => ({ name: c.name, ...c.stats(), level: Math.round(c.level() * 100) / 100, drawCalls: c.drawCalls(), visible: c.group.visible })),
      /** Make a group of a crowd react (checks and captures). */
      react: (name: string, group: string, kind: ReactionKind) => {
        if (!REACTION_KINDS.includes(kind)) return -1;
        const c = [...LIVE_CROWDS].find(x => x.name === name);
        return c ? c.react(group, kind) : -1;
      },
    },
  }),
};
