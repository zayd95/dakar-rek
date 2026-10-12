import type { GameCtx, GameModule } from '../game/modules';
import { isFightEvening } from '../arena/exteriorRules';
import { arenaExterior } from '../arena/exterior';
import { ambientLife } from './ambientLife';
import { AFTER_GALA_ACTS, AFTER_GALA_BOOST } from './ambientData';
import { bringsItUp, fightTalk, galaResultOf, type MyBout, type TalkInput } from './fightTalk';

/**
 * The city around the bout (docs/NPC_LIFE.md « Fight talk »), on the systems that exist:
 *  - greeted people (ambient life, the street crowd, the Dibi's customers — everyone `ctx.people` knows) may talk about
 *    tonight's gala before it and about its result that evening and the next day (src/social/fightTalk.ts);
 *  - after a gala at Pikine the Dibi stays alive until about 1 h: ambient life gets the after-gala activities (a short
 *    queue at the grill, more tables) and the street crowd sends some of the spectators there (src/crowd/street.ts).
 */
type CareerData = { career?: { bouts?: MyBout[] } };

let hubId = '';
let pikine = false;
/** The city day whose evening the arena's street was alive (fans, queue) while the player was in Pikine. */
let boutNight = -99;
let t = 0;

/** Tonight's bout as the city knows it: the big gala Friday–Sunday, a neighbourhood card when the arena has one. */
function tonight(day: number): TalkInput['tonight'] {
  if (isFightEvening(day, 18)) return 'gala';
  return arenaExterior.isEventDay(day, 18) ? 'card' : null;
}

/** What `name` says about the bout in this exchange (seeded), or null. Exported for the debug entries and the checks. */
export function talkNow(ctx: GameCtx, name: string, seed: string, always = false): string | null {
  if (!always && !bringsItUp(seed)) return null;
  const c = ctx.state.data.counters, bouts = (ctx.state.data as CareerData).career?.bouts;
  const last = bouts?.length ? bouts[bouts.length - 1] : null;
  return fightTalk({
    day: ctx.day(), hour: ctx.hour(), pikine, tonight: tonight(ctx.day()), gala: galaResultOf(c),
    mine: last ? { day: last.day, opp: last.opp, res: last.res } : null, name, seed,
  });
}

/** The night of a bout at Pikine, between the end of the gala and about 1 h: the Dibi's after-gala hours. */
export function dibiNight(ctx: GameCtx): boolean {
  if (!pikine) return false;
  const h = ctx.hour(), day = Math.floor(ctx.day()), night = h < 6 ? day - 1 : day;
  if (!(h >= 22.5 || h < 1.25)) return false;
  return galaResultOf(ctx.state.data.counters)?.day === night || boutNight === night;
}

export const fightTalkModule: GameModule = {
  name: 'fight-talk',
  init(ctx) { ctx.people.setTopic((name, seed) => talkNow(ctx, name, seed)); },
  hubLoaded(_ctx, hub) { hubId = hub.id; pikine = hub.id === 'pikine'; t = 0; },
  update(ctx, dt) {
    t -= dt; if (t > 0) return; t = 2;
    if (pikine && arenaExterior.active() && ctx.hour() >= 16) boutNight = Math.floor(ctx.day());
    ambientLife.setEvent(dibiNight(ctx) ? { acts: AFTER_GALA_ACTS, tags: ['dibi'], boost: AFTER_GALA_BOOST } : null);
  },
  debug: ctx => ({
    fightTalk: {
      /** What a person would say about the bout now (`always`: skip the « brings it up » draw). */
      line: (name = 'Awa', seed = 'debug', always = true) => talkNow(ctx, name, seed, always),
      state: () => ({ hub: hubId, tonight: tonight(ctx.day()), gala: galaResultOf(ctx.state.data.counters), boutNight, dibiNight: dibiNight(ctx), event: ambientLife.eventOn() }),
    },
  }),
};
