import type { GameModule } from '../game/modules';
import { WEAR } from '../economy/catalog';
import { addOwned, holds } from '../economy/assets';
import { adoptStallItems, fanOf, setWorn, worn } from '../economy/wear';
import { answersCheer, dressFan, raisesFlag, sectionEcurie } from './supporterGear';
import { arenaShow } from './module';

/**
 * Who supports whom (spec 10 Oct, « rester dans l'arène avec d'autres joueurs »): the player wears a piece in an
 * écurie's colours bought at the arena's stall (src/economy/wear.ts) —
 *   - on their own body, in the city and in the stands (src/arena/supporterGear.ts dressFan);
 *   - for the others, through one small presence field `fan: { e, k }` (écurie, item), validated by the protocol
 *     (src/multiplayer/protocol.ts parseFan); remote avatars are dressed from it (main.ts → RemoteAvatars.dress);
 *   - seated in the stands with a flag, it goes up with the arms when the crowd cheers their wrestler (entrance, a fall
 *     he wins, his victory): the player rises for a moment like « Encourager »;
 *   - seated in their own écurie's section wearing its colours, « Encourager » makes the neighbours answer (the
 *     stands' own reaction, rippling out from the player's place).
 * Cosmetic only: no stat, money or reward comes from it.
 */
const state = { raising: false, answered: 0, raised: 0, lastAnswer: 0 };
let unlisten: (() => void) | null = null;

export const supportersModule: GameModule = {
  name: 'supporters',
  init(ctx) {
    adoptStallItems(ctx.state);                                       // an older save's stall scarves and flags (src/economy/wear.ts)
    unlisten?.();
    // the flag goes up with the arms when the stands cheer the player's wrestler
    unlisten = arenaShow.listen((moment, side) => {
      const seat = ctx.player.seated(), fan = fanOf(worn(ctx.state));
      if (!seat || seat.kind !== 'stand' || !raisesFlag(fan, moment, side)) return;
      state.raising = true;
      if (ctx.player.cheer(2.5)) state.raised++;
      state.raising = false;
    });
  },
  update(ctx) {
    const body = ctx.player.body();
    if (body) dressFan(body, fanOf(worn(ctx.state)));
  },
  presence(ctx) { const fan = fanOf(worn(ctx.state)); return fan ? { fan } : null; },
  /** « Encourager » from a place of the stands: in one's own écurie's section, wearing its colours, the neighbours answer. */
  cheered(ctx) {
    if (state.raising) return;
    const seat = ctx.player.seated(), fan = fanOf(worn(ctx.state));
    if (!seat || !answersCheer(fan, seat)) return;
    const n = arenaShow.react(`sec:${seat.section}`, 'shout', { share: 0.75, seconds: 2.5, origin: { x: seat.x, z: seat.z }, speed: 8 });
    state.lastAnswer = n;
    if (n > 0) state.answered++;
  },
  debug: ctx => ({
    /** What the player wears, what they own of it, the presence field, what the body shows, the stands' answers. */
    supporters: () => {
      const w = worn(ctx.state), seat = ctx.player.seated();
      return { worn: w?.id ?? null, owned: WEAR.filter(x => holds(ctx.state, x.id)).map(x => x.id), field: fanOf(w), body: (ctx.player.body()?.group.userData.fan as string | null) ?? null,
        answered: state.answered, lastAnswer: state.lastAnswer, raised: state.raised, section: seat?.section ?? null, sectionEcurie: sectionEcurie(seat?.section) };
    },
    /** Checks: own a piece without the stall (paid nothing) and wear it; null takes it off. */
    supportersWear: (id: string | null) => {
      if (id && !holds(ctx.state, id)) addOwned(ctx.state, id, 0);
      return setWorn(ctx.state, id);
    },
  }),
};
