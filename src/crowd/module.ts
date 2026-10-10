import type { GameModule } from '../game/modules';
import { LIVE_CROWDS } from './crowd';
import { REACTION_KINDS, type ReactionKind } from './reactions';

/**
 * The crowd lane's module (docs/CROWD.md): nothing to build per hub (each owner makes its own crowd: the arena's stands,
 * the fans at the gate…), only the debug entries the checks read.
 */
export const crowdModule: GameModule = {
  name: 'crowd',
  debug: () => ({
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
