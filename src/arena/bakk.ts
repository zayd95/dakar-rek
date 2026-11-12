import type { GameCtx, GameModule } from '../game/modules';
import type { ActivitySpec } from '../activity/types';
import type { TargetSource } from '../interact/types';
import { PREP_SIDE } from '../world/arenaModules';
import { LIVE_CROWDS } from '../crowd/crowd';
import { summary } from '../career/career';
import { loadProfile } from '../multiplayer/client';
import { paChime } from '../lamb/audio';
import { arenaFighter, type FighterCue } from './fighter';
import { drumRhythm, hasGestured } from './exteriorAudio';
import { fightNight } from './people';
import { announceLine, answerLine, playerBoastLine, seeded, type Fighter, type Who } from './ceremony';

/**
 * The player's own bàkk (src/arena/ceremony.ts), when they fight tonight (src/arena/fighter.ts): once they walk out of
 * their corner towards the ring, « Faire ton bàkk » is offered — a short dance and a boast, entirely optional (walk on to
 * the ring, or stop it). The drums change rhythm, their people cheer round them and the stands on their side answer.
 * The announcer names them on the way out, with their record. No reward, no rite: a moment of the evening only.
 */
export const BAKK_ID = 'bakk';
/** Seconds of each beat of the player's bàkk (a dance, then the arms up while the answer comes). */
export const PLAYER_BAKK = [{ clip: 'Dance_A', seconds: 2.4 }, { clip: 'Celebrate', seconds: 1.8 }] as const;

/** The activity of the bàkk: two beats, the boast, then the answer; nothing earned, nothing spent. */
export function bakkActivity(seed: string, hooks: { answered: () => boolean; answer: () => void; end: () => void }): ActivitySpec {
  return {
    id: BAKK_ID, primitive: 'dance', label: 'Faire ton bàkk', icon: '🥁', detail: 'Facultatif : une danse et un mot avant le cercle',
    steps: [
      { label: 'Ton bàkk', primitive: 'dance', seconds: PLAYER_BAKK[0].seconds, clip: PLAYER_BAKK[0].clip, line: playerBoastLine(seed), then: hooks.answer },
      { label: 'Ton bàkk', primitive: 'dance', seconds: PLAYER_BAKK[1].seconds, clip: PLAYER_BAKK[1].clip, line: () => answerLine(hooks.answered()), then: hooks.end },
    ],
  };
}

/** Which stands are on the player's side tonight: those by their écurie's corner. */
export const standsSide = (ecurie: 'baobab' | 'teranga'): Who => (PREP_SIDE[ecurie] > 0 ? 'left' : 'right');

let offer = false, running = false, done = false, answered = false;
let off: (() => void) | null = null;

/** The player as a wrestler of the evening: his profile name (« Toi » without one) and his écurie. */
export function playerFighter(ctx: GameCtx): Fighter {
  let st: Storage | null = null; try { st = localStorage; } catch { /* blocked */ }
  const name = loadProfile(st, ctx.state.data.guestId).name || 'Toi';
  return { id: 'player', name, ecurie: ctx.state.data.flags.includes('ecurie_baobab') ? 'Baobab' : 'indépendant' };
}

function cue(ctx: GameCtx, c: FighterCue) {
  if (c === 'walk-out') {
    const e = arenaFighter.corner(); if (!e) return;
    offer = true; done = false;
    const rec = summary(ctx.state.data.career?.bouts ?? []);
    // on their own gala night the ceremony has already named them (src/arena/ceremony.ts): one voice, said once
    if (!arenaFighter.main()) {
      if (hasGestured()) paChime();
      ctx.toast(announceLine(playerFighter(ctx), standsSide(e), rec.bouts ? rec : null));
    }
    ctx.toast('Avant le cercle : « Faire ton bàkk » si tu veux — ou avance directement.');
  }
  if (c === 'bout' || c === 'called' || c === 'exit') { offer = false; if (running) finish(); }
}
function start(ctx: GameCtx) {
  const e = arenaFighter.corner(); if (!e || running) return;
  running = true; offer = false; answered = false;
  drumRhythm('bakk');
  fightNight.current?.cheerFighter(3);
  const spec = bakkActivity(`${ctx.day()}:${seeded(ctx.state.data.guestId, 97)}`, {
    answered: () => answered,
    answer: () => {                                                                // the stands on their side answer
      const stands = [...LIVE_CROWDS].find(x => x.name === 'arena-stands');
      answered = (stands?.react(standsSide(e), 'shout', { share: 0.8, seconds: 4 }) ?? 0) > 0;
      fightNight.current?.cheerFighter(4);
    },
    end: () => finish(),
  });
  ctx.activities.start(spec, { place: 'Arène de Pikine' });
}
function finish() { running = false; done = true; drumRhythm('gala'); }

const source = (ctx: GameCtx): TargetSource => ({
  name: 'arena:bakk',
  collect(space, x, z, out) {
    if (!offer || running || space !== 'street' || arenaFighter.phase() !== 'ring') return;
    out.push({ id: 'self:bakk', name: 'Ton bàkk', kind: 'self', space, x, z, y: 2.1, radius: 1.5, bias: -2,
      affordances: () => [{ id: BAKK_ID, verb: 'dance', label: 'Faire ton bàkk', icon: '🥁', detail: 'Facultatif : une danse et un mot avant le cercle', run: () => start(ctx) }] });
  },
});

export const bakkModule: GameModule = {
  name: 'arenaBakk',
  init(ctx) {
    off?.(); off = arenaFighter.onCue(c => cue(ctx, c));
    ctx.interactions.add(source(ctx));
  },
  update(ctx) {
    if (running && ctx.activities.current?.spec.id !== BAKK_ID) finish();       // stopped (« Arrêter ») or done
    if (offer && arenaFighter.phase() !== 'ring') offer = false;
  },
  debug: () => ({
    /** The player's bàkk on the way to the ring: offered, playing, done; the drums' rhythm. */
    bakk: () => ({ offer, running, done, answered, rhythm: drumRhythm() }),
  }),
};
