import { BILL } from '../arena/program';
import { seedHash, say } from '../i18n/wolof';
import { typo } from '../i18n/lines';

/**
 * The city talks about tonight's bout (docs/NPC_LIFE.md « Fight talk »): pure line selection, no Three.js, no DOM
 * (tested in tests/fightTalk.test.ts).
 *
 * People greeted in the street (ambient life, the street crowd, the Dibi's customers) may say a word about the gala:
 *  - before it, on a bout day: « Ce soir il y a gala à Pikine ! » (a weekday card is only talked about in Pikine);
 *  - that evening and the next day, the result the city really saw: the gala's (recorded by the arena when the bout
 *    ends) or the player's own bout (the career's record). Never an invented result: no record, no result line;
 *  - on a day without a bout and without a recent result, nothing.
 * French with everyday Wolof from the lexicon (CLAD), glossed like every line of the game.
 */

/** Counters of the save holding the last gala result the city saw (city day, winner side, how). */
export const GALA_NEWS = { day: 'news_gala_day', winner: 'news_gala_winner', how: 'news_gala_how' } as const;
export type GalaHow = 'projection' | 'decision' | 'draw';
const HOW_CODE: Record<GalaHow, number> = { projection: 1, decision: 2, draw: 3 };

/** Record the gala's result (the arena calls it when the bout ends). `winner`: BILL side, null for a draw or no winner. */
export function recordGalaResult(counters: Record<string, number>, day: number, winner: 'left' | 'right' | null, outcome: string | null | undefined) {
  const how: GalaHow = !winner || outcome === 'egalite' || outcome === 'abandon' ? 'draw' : outcome === 'projection' ? 'projection' : 'decision';
  counters[GALA_NEWS.day] = Math.floor(day);
  counters[GALA_NEWS.winner] = winner === 'left' ? 1 : winner === 'right' ? 2 : 0;
  counters[GALA_NEWS.how] = HOW_CODE[how];
}

export interface GalaResult { day: number; winner: { name: string; ecurie: string } | null; loser: { name: string; ecurie: string } | null; how: GalaHow }
/** The last gala result in the save, or null (never played, or nothing recorded). */
export function galaResultOf(counters: Record<string, number>): GalaResult | null {
  const day = counters[GALA_NEWS.day];
  if (day === undefined) return null;
  const w = counters[GALA_NEWS.winner] ?? 0, code = counters[GALA_NEWS.how] ?? 3;
  const how: GalaHow = code === 1 ? 'projection' : code === 2 ? 'decision' : 'draw';
  if (how === 'draw' || !w) return { day, winner: null, loser: null, how: 'draw' };
  const win = w === 1 ? BILL.left : BILL.right, lose = w === 1 ? BILL.right : BILL.left;
  return { day, winner: { name: win.name, ecurie: win.ecurie }, loser: { name: lose.name, ecurie: lose.ecurie }, how };
}

/** The player's own last bout, as the career records it (src/career/career.ts BoutEntry). */
export interface MyBout { day: number; opp: string; res: 'V' | 'D' | 'N' | 'A' }

export interface TalkInput {
  /** City day and hour. */
  day: number; hour: number;
  /** In Pikine (where the arena is): the weekday card is only talked about there. */
  pikine: boolean;
  /** Tonight's bout: the big gala (Friday–Sunday), a neighbourhood card, or none. */
  tonight: 'gala' | 'card' | null;
  /** The gala's last result (galaResultOf), the player's last bout (career). */
  gala: GalaResult | null;
  mine: MyBout | null;
  /** Who speaks (their name or « Passant ») and a seed for this exchange (person + count). */
  name: string; seed: string;
}

/** Days a result stays in people's mouths: that evening and the next day. */
export const TALK_DAYS = 1;
/** The doors open at 17 h: before that, people anticipate; a result exists only once a bout has been seen. */
const DOORS = 17;

const pick = <T>(list: readonly T[], seed: string, salt: string): T => list[seedHash(`${salt}:${seed}`) % list.length];
/** One person speaking: « … », with the French typography of the game's lines. */
const line = (who: string, text: string) => typo(`${who} : « ${text} »`);

/** What a greeted person says about the bout, or null (nothing to say: no bout, no recent result). */
export function fightTalk(i: TalkInput): string | null {
  const today = Math.floor(i.day), when = (d: number) => (Math.floor(d) === today ? 'ce soir' : 'hier soir');
  // the player's own bout, that evening and the next day
  if (i.mine && i.mine.res !== 'A' && today - Math.floor(i.mine.day) <= TALK_DAYS && today >= Math.floor(i.mine.day)) {
    const w = when(i.mine.day), o = i.mine.opp;
    const lines = i.mine.res === 'V'
      ? [`${say('Waaw kay')} ! C’est toi qui as battu ${o} ${w} ? Tout le quartier en parle.`, `Tu as battu ${o} ${w} ? ${say('Rafet na')} ! On en parle partout.`]
      : i.mine.res === 'D'
        ? [`${o} t’a eu ${w}. ${say('Ndank ndank')}, la revanche viendra.`, `J’ai entendu pour ${o}… ${say('Bul tiit')}, tu le battras la prochaine fois.`]
        : [`Match nul contre ${o} ${w} ! Il faudra une revanche.`];
    return line(i.name, pick(lines, i.seed, 'mine'));
  }
  // the gala's result, that evening (after the bout) and the next day
  const g = i.gala;
  if (g && today >= Math.floor(g.day) && today - Math.floor(g.day) <= TALK_DAYS) {
    const w = when(g.day);
    if (!g.winner || !g.loser || g.how === 'draw') {
      return line(i.name, pick([
        `Match nul entre ${BILL.left.name} et ${BILL.right.name} ${w}… Il faudra une revanche.`,
        `${BILL.left.ecurie} et ${BILL.right.ecurie} dos à dos ${w}. ${say('Ndank ndank')}, on verra au prochain gala.`,
      ], i.seed, 'draw'));
    }
    const W = g.winner, L = g.loser;
    const lines = g.how === 'projection'
      ? [`${say('Daan na')} ! ${W.name} a mis ${L.name} au sol ${w} !`, `Tu as vu ${W.name} ${w} ? Il a fait tomber ${L.name}, ${say('Waaw kay')} !`, `${w === 'ce soir' ? 'Ce soir encore' : 'Hier soir encore'}, ${W.ecurie} a gagné. ${L.ecurie} va devoir se reprendre.`]
      : [`${W.name} l’a emporté aux points ${w}, mais ${L.name} a bien tenu.`, `${say('Daan na')}, ${W.name}… à la décision de l’arbitre ${w}. ${L.ecurie} réclame une revanche.`];
    return line(i.name, pick(lines, i.seed, 'gala'));
  }
  // before tonight's bout (a weekday card is only news in Pikine)
  const h = ((i.hour % 24) + 24) % 24;
  if (i.tonight === 'gala' && h >= 8 && h < DOORS + 2) {
    return line(i.name, pick([
      `Ce soir il y a gala à Pikine : ${BILL.left.name} contre ${BILL.right.name} !`,
      `${say('Lu bees ?')} Ce soir, ${BILL.left.ecurie} contre ${BILL.right.ecurie} à l’arène de Pikine.`,
      `Tu vas à l’arène ce soir ? ${BILL.left.name} contre ${BILL.right.name}, ça va être chaud.`,
    ], i.seed, 'gala-soon'));
  }
  if (i.tonight === 'card' && i.pikine && h >= 12 && h < DOORS + 2) {
    return line(i.name, pick([
      `Il y a un combat de quartier ce soir à l’arène, ${BILL.left.name} contre ${BILL.right.name}.`,
      `Ce soir à l’arène : ${BILL.left.name} et ${BILL.right.name}. Ce n’est pas le grand gala, mais ça vaut le coup.`,
    ], i.seed, 'card-soon'));
  }
  return null;
}

/** Whether a greeted person brings the bout up in this exchange (about half of them; the same answer for the same seed). */
export const bringsItUp = (seed: string, share = 0.55) => (seedHash(`fight-talk:${seed}`) % 100) < share * 100;
