/**
 * Short spoken exchanges built from the Wolof lexicon (src/i18n/wolof.ts): greeting a passer-by, asking a name,
 * small talk, leave-taking, asking a price and haggling, the hosts of a Dibi / gargote / mosque / beach, the car
 * rapide apprentice and the chat's quick phrases. French narration, Wolof speech, the French gloss after the quote:
 *
 *   Toi : « Salaam aleekum ! » · Awa : « Maleekum salaam ! »
 *   Awa : « Na nga fanaane ? » (bien dormi ?) · Toi : « Jàmm rekk. » (tout va bien)
 *
 * Every Wolof phrase given as a string must be a lexicon entry (tests/wolof-lines.test.ts generates every line and checks
 * it); a templated phrase (a price, a first name) is passed as `{ wo, fr }`. Lines are short on purpose: one toast,
 * two speakers. Mosque: the everyday greeting only, never a recitation.
 */
import { cityTimeAt } from '../core/clock';
import { byTag, find, farewellAt, glossOf, greetingAt, lex, replyTo, seedHash, wo, type Lex } from './wolof';

// ------------------------------------------------------------------ city hour

let hourSource: (() => number) | null = null;
/** The game's clock (set by the Wolof module from `GameCtx.hour`, so the debug `setHour` applies). */
export function setHourSource(fn: (() => number) | null) { hourSource = fn; }
/** City hour for greetings: the game's clock when it runs, the shared city clock otherwise. */
export const cityHour = (): number => hourSource?.() ?? cityTimeAt(Date.now()).hourFloat;

// ------------------------------------------------------------------ utterances

/** A Wolof phrase: a lexicon phrase with its punctuation (« Seer na ! »), or a templated one with its own gloss. */
export type Phrase = string | { wo: string; fr?: string };
export type Turn = [who: string, phrases: Phrase[]];

/** Phrases given as strings that are not in the lexicon (tests keep this empty). */
export const unknownPhrases = new Set<string>();

/**
 * French typography for a line: a narrow no-break space before ? ! ; and a no-break space before : and inside « »,
 * so a phone never wraps « Na nga def » away from its « ? ».
 */
export const typo = (s: string): string => s.replace(/ ([?!;])/g, '\u202f$1').replace(/ :/g, '\u00a0:').replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»');

/** One person speaking: « … », then the glosses of the less obvious phrases: « Seer na ! Wàññi ko tuuti. » (c’est cher · baisse un peu). */
export function utter(phrases: Phrase[]): string {
  const text = phrases.map(p => (typeof p === 'string' ? p : p.wo)).join(' ');
  const glosses = phrases.map(p => {
    if (typeof p !== 'string') return p.fr ?? '';
    if (!find(p)) unknownPhrases.add(p);
    return glossOf(p);
  }).filter(Boolean);
  return wo(typo(`« ${text} »`), typo(glosses.join(' · ')));
}
/** A short exchange on one line: Toi : « … » · Awa : « … ». */
export const exchange = (...turns: Turn[]): string => turns.map(([who, ph]) => `${who}\u00a0: ${utter(ph)}`).join(' · ');

/** A lexicon phrase said with feeling: « Ba ci kanam ! » (questions keep their « ? »). */
const bang = (e: Lex) => (e.wo.endsWith('?') ? e.wo : `${e.wo} !`);
/** A lexicon phrase as a plain statement: « Jàmm rekk. » */
const dot = (e: Lex) => (e.wo.endsWith('?') ? e.wo : `${e.wo}.`);
const pickOf = <T>(list: readonly T[], seed: string | number, salt: string): T => list[seedHash(`${salt}:${seed}`) % list.length];

export const ME = 'Toi';

// ------------------------------------------------------------------ people in the street

/** The usual answers to a greeting; a person keeps theirs (seed = their id). */
const ANSWERS: Record<string, string[]> = {
  'Na nga def ?': ['Maa ngi fi rekk', 'Jàmm rekk'],
  'Na nga fanaane ?': ['Jàmm rekk'],
  'Na nga yendoo ?': ['Jàmm rekk'],
  'Jàmm nga am ?': ['Jàmm rekk'],
};
const answerTo = (ask: Lex, seed: string | number): Lex =>
  lex(pickOf(ANSWERS[ask.wo] ?? [replyTo(ask.wo)?.wo ?? 'Jàmm rekk'], seed, 'answer'));

/**
 * « Saluer » a passer-by. The first time: « Salaam aleekum ! » and the answer, then — for most people, always the same
 * way for the same person — the greeting of the hour or « Jàmm nga am ? », and your answer. Already greeted: the
 * greeting of the hour and their answer. Returns the lines to show one after the other.
 */
export function greetLines(o: { name: string; seed: string; hour: number; again?: boolean }): string[] {
  const time = greetingAt(o.hour);
  if (o.again) return [exchange([ME, [time.wo]], [o.name, [dot(answerTo(time, o.seed))]])];
  const first = exchange([ME, ['Salaam aleekum !']], [o.name, ['Maleekum salaam !']]);
  const style = seedHash(`greet:${o.seed}`) % 4;                // 0: the answer only · 1–2: greeting of the hour · 3: « Jàmm nga am ? »
  if (style === 0) return [first];
  const ask = style < 3 ? time : lex('Jàmm nga am ?');
  return [first, exchange([o.name, [ask.wo]], [ME, [dot(answerTo(ask, `${o.seed}:me`))]])];
}

/** « Demander son nom » : « Naka nga tudd ? » — « Maa ngi tudd Awa. » or « Awa laa tudd. » (the same for the same person). */
export function nameLines(o: { name: string; seed: string }): string[] {
  const answer = seedHash(`name:${o.seed}`) % 2 ? `Maa ngi tudd ${o.name}.` : `${o.name} laa tudd.`;
  return [exchange([ME, ['Naka nga tudd ?']], [o.name, [{ wo: answer, fr: `je m’appelle ${o.name}` }]])];
}

/**
 * « Parler avec Awa »: a short piece of small talk, different from one chat to the next (seed = person + count):
 * news (« Lu bees ? » — « Dara. »), the heat in the afternoon, an invitation to eat at meal times.
 */
export function smallTalkLines(o: { name: string; seed: string | number; hour: number }): string[] {
  const h = ((Math.floor(o.hour) % 24) + 24) % 24;
  const options: string[] = [];
  const news = pickOf(byTag('news'), o.seed, 'news');
  options.push(exchange([o.name, [news.wo]], [ME, [dot(answerTo(news, `${o.seed}:me`))]]));
  if (h >= 12 && h < 17) options.push(exchange([o.name, ['Dafa tàng !']], [ME, ['Dëgg la.']]));
  if ((h >= 12 && h < 15) || (h >= 19 && h < 22)) options.push(exchange([o.name, ['Kaay lekk !']], [ME, ['Jërëjëf,', 'dama suur.']]));
  return [pickOf(options, o.seed, 'talk')];
}

/** « Dire au revoir »: « Ba beneen yoon ! » by day, « Fanaanal ak jàmm ! » — « Ba suba ! » at night. */
export function farewellLines(o: { name: string; seed: string | number; hour: number }): string[] {
  const bye = farewellAt(o.hour);
  if (bye.wo === 'Fanaanal ak jàmm') return [exchange([ME, [bang(bye)]], [o.name, ['Ba suba !']])];
  const mine = pickOf(['Ba beneen yoon', 'Ba ci kanam'], o.seed, 'bye-me');
  const theirs = pickOf(['Ba beneen yoon', 'Ba ci kanam'], o.seed, 'bye');
  return [exchange([ME, ['Maa ngi dem.', `${mine} !`]], [o.name, [`${theirs} !`]])];
}

// ------------------------------------------------------------------ prices and haggling

/** Same format as the HUD's fcfa(): narrow no-break space between thousands, no-break space before F. */
export const price = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';

/**
 * Asking the price and haggling, at a market stall, the mareyeuses or a street seller (the price itself does not change:
 * the seller holds firm). `buy`: you ask, they answer; `sell`: they ask, you answer. `haggle: false` only asks the price
 * (a boutique's bread and milk). `seed` varies the exchange (a counter, the activity id…).
 */
export function haggleLine(kind: 'buy' | 'sell', amount: number, seed: string | number, who = kind === 'buy' ? 'Vendeuse' : 'Cliente', haggle = true): string {
  const p = price(amount);
  const only = { wo: `${p} rekk.`, fr: `${p} seulement` };
  const lines = kind === 'buy'
    ? [
      exchange([ME, ['Ñaata la ?']], [who, [{ wo: `${p}.` }]]),
      exchange([ME, ['Ñaata la ?']], [who, [{ wo: `${p}.` }, 'Yomb na !']]),
      ...(haggle ? [exchange([ME, ['Seer na !', 'Wàññi ko tuuti.']], [who, ['Déedéet,', only]])] : []),
    ]
    : [
      exchange([who, ['Ñaata la ?']], [ME, [{ wo: `${p}.` }]]),
      exchange([who, ['Ñaata la ?']], [ME, [{ wo: `${p}.` }, 'Yomb na !']]),
      ...(haggle ? [exchange([who, ['Seer na !', 'Wàññi ko tuuti.']], [ME, ['Déedéet,', only]])] : []),
    ];
  return pickOf(lines, seed, `haggle:${kind}`);
}

/** A fresh haggling line each time the activity runs (for `Step.line`). */
export function haggler(kind: 'buy' | 'sell', amount: number, who?: string, haggle = true): () => string {
  let n = 0;
  return () => haggleLine(kind, amount, n++, who, haggle);
}

// ------------------------------------------------------------------ hosts of a place

export type Host = 'dibi' | 'cook' | 'imam' | 'mareyeuse' | 'pecheur';
const HOST_NAME: Record<Host, string> = { dibi: 'Le patron', cook: 'La cuisinière', imam: 'L’imam', mareyeuse: 'La mareyeuse', pecheur: 'Un pêcheur' };

/**
 * What the host says when you talk to them (the first line of the conversation). The mosque: « Salaam aleekum. » and the
 * everyday « Jàmm nga am ? » only — no recitation, no religious formula.
 */
export function hostLine(host: Host, seed: string | number = 0): string {
  const who = HOST_NAME[host];
  switch (host) {
    case 'dibi': return pickOf([exchange([who, ['Dalal ak jàmm !', 'Toogal.']]), exchange([ME, ['Salaam aleekum !']], [who, ['Maleekum salaam !', 'Dalal ak jàmm.']])], seed, host);
    case 'cook': return pickOf([exchange([who, ['Kaay lekk !']]), exchange([who, ['Dalal ak jàmm !', 'Toogal,', 'kaay lekk.']])], seed, host);
    case 'imam': return exchange([ME, ['Salaam aleekum.']], [who, ['Maleekum salaam.', 'Jàmm nga am ?']]);
    case 'mareyeuse': return pickOf([exchange([who, ['Jën bu bees !']]), exchange([who, ['Jën bu bees !', 'Yomb na !']])], seed, host);
    case 'pecheur': return exchange([who, ['Kaay fi !', 'Gaawal !']]);
  }
}
/** The host's line, different from one visit to the next (for `Step.line`). */
export function hostSays(host: Host): () => string {
  let n = 0;
  return () => hostLine(host, n++);
}
/** The cook or the grill while the plate is prepared: « Xaaral tuuti ! » (attends un peu). */
export const waitLine = (who: string) => exchange([who, ['Xaaral tuuti !']]);
/** Someone calling you over to help: « Kaay fi ! » (viens ici). */
export const comeLine = (who: string) => exchange([who, ['Kaay fi !']]);
/** You, tasting: « Neex na ! » (c’est bon). */
export const tasteLine = () => exchange([ME, ['Neex na !']]);

// ------------------------------------------------------------------ car rapide apprentice

/**
 * What a car rapide apprentice shouts at the door: destinations, twice, and now and then « Nanu dem ! » or
 * « Fan nga dem ? ». Plain text (speech bubbles are drawn on a canvas, no gloss).
 */
export function apprentiCalls(destinations: readonly string[]): string[] {
  const out = destinations.map((d, k) => (k % 3 === 1 ? `${d} ! Nanu dem !` : `${d} ! ${d} !`));
  out.splice(Math.min(2, out.length), 0, 'Fan nga dem ?');
  return out;
}
/** The same call in a sentence, with the gloss: L’apprenti : « Colobane ! Nanu dem ! » (on y va). */
export function apprentiLine(destinations: readonly string[], seed: string | number = 0): string {
  if (!destinations.length) return exchange(['L’apprenti', ['Nanu dem !']]);
  const d = pickOf(destinations, seed, 'stop');
  return exchange(['L’apprenti', [{ wo: `${d} !` }, 'Nanu dem !']]);
}
/** A car rapide line's calls at its stops: the destinations, « Fan nga dem ? » and « Am na place ! » (plain text). */
export const rapideCalls = (destinations: readonly string[]): string[] => [...apprentiCalls(destinations), 'Am na place !'];

/** Someone asks, you answer, on one line after « Ton voisin : »: « Na nga def ? » · Toi : « Maa ngi fi rekk. » */
export const askAndAnswer = (ask: Phrase[], answer: Phrase[]): string => `${utter(ask)} · ${ME} : ${utter(answer)}`;

/**
 * Riding a car rapide (src/transport): paying the apprentice, asking to get off, alighting, the passenger next to you.
 * Stop names stay as written (they are places, not Wolof).
 */
export const RIDE = {
  /** L’apprenti : « 150 F, jërëjëf ! » (merci) */
  fare: (fare: number) => exchange(['L’apprenti', [{ wo: `${price(fare)},` }, 'jërëjëf !']]),
  /** Last call before the car pulls away (canvas bubble, plain text). */
  depart: 'Nanu dem !',
  /** Toi : « Apprenti, dinaa wàcc ci Marché ! » (je descends à Marché) */
  request: (stop: string) => exchange([ME, [{ wo: `Apprenti, dinaa wàcc ci ${stop} !`, fr: `je descends à ${stop}` }]]),
  /** L’apprenti : « Ba beneen yoon ! » (à la prochaine) */
  alight: () => exchange(['L’apprenti', ['Ba beneen yoon !']]),
  /** What the passenger next to you says, and your answer. */
  neighbour: (): string[] => [
    askAndAnswer(['Na nga def ?'], ['Maa ngi fi rekk,', 'jërëjëf.']),
    askAndAnswer(['Salaam aleekum !'], ['Maleekum salaam !']),
    askAndAnswer(['Dafa tàng !'], ['Dëgg la.']),
    askAndAnswer(['Fan nga dem ?'], [{ wo: 'Maa ngi dem liggéey.', fr: 'je vais au travail' }]),
  ],
};

// ------------------------------------------------------------------ the arena's gala evening

/**
 * The gala at the Pikine arena (src/arena): the ticket window, the controller at the gate, the announcer and the crowd. French with a Wolof touch; no ritual or religious formula anywhere in the show.
 */
export const ARENA = {
  /** Le guichetier : « 1 000 F, jërëjëf ! » (merci) */
  ticket: (fare: number) => exchange(['Le guichetier', [{ wo: `${price(fare)},` }, 'jërëjëf !']]),
  /** At the gate with a ticket. */
  welcome: () => `${exchange(['Le contrôleur', ['Dalal ak jàmm !']])} · Les tribunes sont de chaque côté.`,
  /** At the gate without one. */
  stop: () => `${exchange(['Le contrôleur', ['Xaaral tuuti !']])} · Il faut un billet : le guichet est à gauche de la porte.`,
  /** The announcer, when the gala starts. */
  bill: (left: string, leftEcurie: string, right: string, rightEcurie: string) => `Gala de làmb : ${left} (écurie ${leftEcurie}) contre ${right} (écurie ${rightEcurie}) !`,
  /** The wrestlers' entrance: drums, the crowd. */
  entrance: (name: string, ecurie: string) => `Entrée de ${name}, écurie ${ecurie} : sabar et danse.`,
  /** The result, and the crowd's shout. */
  result: (winner: string | null, how: 'projection' | 'decision' | 'egalite' | 'abandon') =>
    winner === null || how === 'egalite' || how === 'abandon'
      ? 'Temps ! Match nul : l’arbitre ne départage pas les deux lutteurs.'
      : `${winner} l’emporte ${how === 'projection' ? 'par projection' : 'à la décision de l’arbitre'} ! · Le public : ${utter(['Daan na !'])}`,
  /** The announcer names a preliminary bout (src/arena/undercard.ts): « Préliminaires 1/3 : Modou (Thiaroye) contre … ». */
  prelim: (k: number, n: number, left: string, right: string) => `Préliminaires ${k}/${n} : ${left} contre ${right}.`,
  /** A preliminary's result, short. */
  prelimResult: (winner: string | null, how: 'projection' | 'decision' | 'egalite' | 'abandon') =>
    winner === null || how === 'egalite' || how === 'abandon' ? 'Préliminaires : match nul.' : `Préliminaires : ${winner} l’emporte ${how === 'projection' ? 'par chute' : 'aux points'}.`,
  /** The end of the evening. */
  over: 'Le gala est fini : le public rentre, la rue se vide.',
};

/** The « gardien de motos » by the arena's gate (src/arena/arrival.ts): French narration, his Wolof with its gloss. */
export const MOTO_GUARD = {
  /** The player gets off in his parking: his greeting, and the price before anything is paid. */
  hello: (fee: number) => `${exchange(['Le gardien', ['Na nga def ?']])} · Parking motos : ${price(fee)} la soirée, payés une fois.`,
  /** Paid: « 100 F, jërëjëf ! » and he puts the moto in the place he keeps by him. */
  paid: (fee: number) => `${exchange(['Le gardien', [{ wo: `${price(fee)},` }, 'jërëjëf !', 'Amul solo.']])} · Il range ta moto à côté de lui.`,
  /** Back on the same evening, already paid: he puts it in its place again. */
  again: () => `${exchange(['Le gardien', ['Dalal ak jàmm !']])} · Ta place t’attend : il range ta moto.`,
  /** Riding away: his goodbye. */
  bye: () => `${exchange(['Le gardien', ['Ñibbil ak jàmm !', 'Ba beneen yoon !']])} · Il te fait signe de la main.`,
};

// ------------------------------------------------------------------ chat

export type ChatPlace = 'street' | 'food' | 'market' | 'transport' | 'mosque' | 'club' | 'home';
/** What kind of place a presence space is (street, an interior's door id, a venue or vehicle id). */
export function chatPlace(space: string): ChatPlace {
  const s = space.toLowerCase();
  if (s === 'home' || s.includes(':home:')) return 'home';
  if (/mosque|mosquee|jumaa/.test(s)) return 'mosque';
  if (/gargote|maiga|dibi|restaurant|cafe|eatery/.test(s)) return 'food';
  if (/market|marche|sandaga|fish|poisson|beach|plage/.test(s)) return 'market';
  if (/rapide|bus|taxi|vehicle|stop|station|ndiaga/.test(s)) return 'transport';
  if (/club|night/.test(s)) return 'club';
  return 'street';
}
const EXTRA: Record<ChatPlace, string[]> = {
  street: ['Lu bees ?', 'Maa ngi ñëw'],
  food: ['Neex na', 'Dama suur'],
  market: ['Ñaata la ?', 'Wàññi ko tuuti'],
  transport: ['Nanu dem', 'Maa ngi ñëw'],
  mosque: [],
  club: ['Rafet na', 'Nanu dem'],
  home: [],
};
/**
 * Quick phrases of the location chat: the greeting of the hour, everyday answers and leave-taking, plus two that fit
 * the place (« Neex na » at a gargote, « Ñaata la ? » at the market, « Nanu dem » in a car rapide). At the mosque: the
 * greeting, thanks and goodbye only.
 */
export function quickChat(space: string, hour: number): Lex[] {
  const kind = chatPlace(space);
  const keys = kind === 'mosque'
    ? ['Salaam aleekum', 'Maleekum salaam', 'Jërëjëf', farewellAt(hour).wo]
    : ['Salaam aleekum', greetingAt(hour).wo, 'Jërëjëf', 'Waaw', 'Déedéet', 'Amul solo', ...EXTRA[kind], farewellAt(hour).wo];
  return [...new Set(keys)].map(k => lex(k));
}
