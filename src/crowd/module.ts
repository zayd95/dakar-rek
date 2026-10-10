import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import { WALL_H, WALL_R } from '../world/geew';
import { LIVE_CROWDS } from './crowd';
import { ArenaArrivals } from './arrivals';
import { StreetLife } from './street';
import { REACTION_KINDS, type ReactionKind } from './reactions';

let arrivals: ArenaArrivals | null = null;
let street: StreetLife | null = null;
let hubNow: HubWorld | null = null;
/** The camera is inside the arena's walls (on the tiers, in the ring): the street outside cannot be seen. */
export function insideArena(ctx: GameCtx, hub: HubWorld | null): boolean {
  const a = hub?.arena, c = ctx.camera.position;
  return !!a && Math.hypot(c.x - a.cx, c.z - a.cz) < WALL_R - 0.3 && c.y < WALL_H + 3;
}

/**
 * The crowd lane's module (docs/CROWD.md). Owners make their own crowds (the arena's stands in src/arena/module.ts); this
 * module runs the fans arriving at the arena on fight evenings (src/crowd/arrivals.ts) and the debug entries the checks read.
 */
export const crowdModule: GameModule = {
  name: 'crowd',
  init(ctx) {
    // the full humanoids of every crowd can be greeted like anyone in the street
    ctx.people.addBodies(() => [...LIVE_CROWDS].filter(c => c.group.visible).flatMap(c => c.people()));
  },
  hubLoaded(ctx, hub) {
    arrivals?.dispose(); arrivals = null;
    street?.dispose(); street = null;
    hubNow = hub;
    if (hub.arena && hub.id === 'pikine') arrivals = new ArenaArrivals(ctx, hub);
    street = new StreetLife(ctx, hub, arrivals);
  },
  update(ctx, dt) {
    // the street's people are out there: hidden in a làmb scene, inside an interior or inside the arena's walls (they
    // keep living; the walls hide them anyway and the frame saves their draw calls)
    const enclosed = insideArena(ctx, hubNow);
    const away = ctx.mode() === 'scene' || !!ctx.inside() || enclosed;
    arrivals?.update(dt);
    street?.update(dt);
    if (street) street.crowd.group.visible = !away;
    if (arrivals) arrivals.hidden = enclosed;
  },
  debug: () => ({
    street: {
      info: () => street?.info() ?? null,
      where: () => street?.where() ?? [],
      blocked: () => street?.blocked() ?? [],
      /** Start the after-gala flow now (`n` spectators leaving). */
      leaveNow: (n?: number) => street?.leaveNow(n),
    },
    arrivals: {
      info: () => arrivals?.info() ?? null,
      /** A taxi now on route r (0 west road, 1 east road); `close`: starting 25 m before its stop. */
      taxi: (r?: number, close = false) => arrivals?.taxi(r, false, close) ?? false,
      /** The arrivals' clock runs `n` times faster (checks on slow renderers). */
      speed: (n = 1) => { if (arrivals) arrivals.speed = Math.max(1, n); },
    },
    crowds: {
      /** Every live crowd: who is shown at which level of detail, who reacts, the draw calls it costs. */
      list: () => [...LIVE_CROWDS].map(c => ({ name: c.name, ...c.stats(), level: Math.round(c.level() * 100) / 100, drawCalls: c.drawCalls(), visible: c.group.visible })),
      /** Everyone in a crowd settles back at once (checks: one reaction at a time). */
      calm: (name: string) => { [...LIVE_CROWDS].find(x => x.name === name)?.calm('all'); },
      /** Make a group of a crowd react (checks and captures). */
      react: (name: string, group: string, kind: ReactionKind) => {
        if (!REACTION_KINDS.includes(kind)) return -1;
        const c = [...LIVE_CROWDS].find(x => x.name === name);
        return c ? c.react(group, kind) : -1;
      },
    },
  }),
};
