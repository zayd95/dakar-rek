import type { GameModule } from '../game/modules';
import { installGlossResolver } from './dom';
import { cityHour, farewellLines, greetLines, haggleLine, nameLines, quickChat, setHourSource, smallTalkLines } from './lines';
import { glossed, glossesShown, LEXICON, setGlossesShown } from './wolof';

/**
 * The Wolof module (Habib, 9 Oct 2026: French with everyday Wolof, our own rules): the game's clock for greetings by
 * the hour, and the gloss resolver for every text of the interface (Réglages › Langue). Lines themselves live in
 * src/i18n/lines.ts and are used by the people, places, recipes, apprentices and chat.
 */
export const wolofModule: GameModule = {
  name: 'wolof',
  init(ctx) {
    setHourSource(() => ctx.hour());
    if (typeof document !== 'undefined' && document.body) installGlossResolver(document.body);
  },
  debug: () => ({
    wolof: {
      entries: LEXICON.length,
      hour: () => cityHour(),
      glosses: (on?: boolean) => { if (on !== undefined) setGlossesShown(on); return glossesShown(); },
      quickChat: (space = 'street') => quickChat(space, cityHour()).map(e => e.wo),
      sample: () => {
        const h = cityHour(), g = (l: string[]) => l.map(x => glossed(x, true));
        return {
          greet: g(greetLines({ name: 'Awa', seed: 'sample', hour: h })), name: g(nameLines({ name: 'Awa', seed: 'sample' })),
          talk: g(smallTalkLines({ name: 'Awa', seed: 'sample', hour: h })), bye: g(farewellLines({ name: 'Awa', seed: 'sample', hour: h })),
          haggle: glossed(haggleLine('buy', 700, 0), true),
        };
      },
    },
  }),
};
