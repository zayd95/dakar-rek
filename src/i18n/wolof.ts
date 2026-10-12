/**
 * Wolof library: the everyday Dakar Wolof the game speaks (Habib, 9 Oct 2026: « on crée nos règles », Wolof only for now).
 *
 * - Standard Latin orthography (CLAD): ë, à, é, ó, ñ, ŋ, x; doubled letters for long vowels and geminates.
 * - Short, very common phrases only. When unsure, leave it out. No insults, no religious recitation, nothing sexual
 *   or political. Other national languages (Pulaar, Sérère, Diola…) are not written in the game for now; a sheet may
 *   say in French that someone speaks them at home.
 * - Every entry has a French gloss. Dialogue mixes Wolof into French the way Dakar speech does: `say('Jërëjëf')` gives
 *   « Jërëjëf (merci) », and the gloss can be hidden in Réglages › Langue (`glossed` resolves it at display time).
 *
 * Conventions and usage: docs/WOLOF.md.
 */

export type Tag =
  | 'greeting' | 'reply' | 'thanks' | 'farewell' | 'yesno' | 'ask' | 'invite' | 'market' | 'food' | 'attaya'
  | 'work' | 'money' | 'encourage' | 'lamb' | 'weather' | 'family' | 'blessing' | 'chat' | 'proverb' | 'sea'
  | 'morning' | 'evening' | 'night' | 'news' | 'word' | 'transport';

export interface Lex {
  /** Wolof, CLAD orthography. Phrases start with a capital; single words are lower case. */
  wo: string;
  /** French gloss, short, shown in parentheses when glosses are on. */
  fr: string;
  tags: Tag[];
  /** The usual answer (the `wo` of another entry). */
  reply?: string;
  /** Known by every player (« Salaam aleekum », « attaya »): said without a French gloss. */
  known?: true;
}

const L = (wo: string, fr: string, tags: Tag[], reply?: string): Lex => (reply ? { wo, fr, tags, reply } : { wo, fr, tags });
/** An entry every player knows: no gloss in dialogue. */
const K = (wo: string, fr: string, tags: Tag[], reply?: string): Lex => ({ ...L(wo, fr, tags, reply), known: true });

export const LEXICON: readonly Lex[] = [
  // Greetings and their answers
  K('Salaam aleekum', 'bonjour', ['greeting'], 'Maleekum salaam'),
  K('Maleekum salaam', 'la paix sur toi aussi', ['reply']),
  L('Na nga def ?', 'comment ça va ?', ['greeting', 'ask', 'news', 'chat'], 'Maa ngi fi rekk'),
  L('Maa ngi fi rekk', 'je suis là, ça va', ['reply', 'chat']),
  L('Jàmm nga am ?', 'tout va bien ?', ['greeting', 'ask', 'news'], 'Jàmm rekk'),
  L('Jàmm rekk', 'tout va bien', ['reply', 'blessing', 'chat']),
  L('Na nga fanaane ?', 'bien dormi ?', ['greeting', 'morning'], 'Jàmm rekk'),
  L('Na nga yendoo ?', 'la journée s’est bien passée ?', ['greeting', 'evening'], 'Jàmm rekk'),
  L('Ana waa kër gi ?', 'et la famille ?', ['greeting', 'ask', 'news', 'family'], 'Ñu ngi fa'),
  L('Ñu ngi fa', 'ils vont bien', ['reply', 'family']),
  L('Naka liggéey bi ?', 'et le travail ?', ['ask', 'news', 'work'], 'Ndank ndank'),
  L('Dalal ak jàmm', 'bienvenue', ['greeting', 'invite', 'blessing']),
  // Thanks
  L('Jërëjëf', 'merci', ['thanks', 'chat'], 'Ñoo ko bokk'),
  L('Ñoo ko bokk', 'de rien', ['reply', 'thanks']),
  // Leave-taking
  L('Ba beneen yoon', 'à la prochaine', ['farewell', 'chat']),
  L('Ba ci kanam', 'à plus tard', ['farewell']),
  L('Ba suba', 'à demain', ['farewell']),
  L('Fanaanal ak jàmm', 'bonne nuit', ['farewell', 'night', 'blessing']),
  L('Ñibbil ak jàmm', 'rentre bien', ['farewell', 'blessing']),
  L('Maa ngi dem', 'j’y vais', ['farewell', 'chat']),
  // Yes, no, asking
  L('Waaw', 'oui', ['yesno', 'chat']),
  L('Déedéet', 'non', ['yesno', 'chat']),
  L('Waaw kay', 'bien sûr', ['yesno', 'chat']),
  L('Lu bees ?', 'quoi de neuf ?', ['ask', 'news', 'chat'], 'Dara'),
  L('Dara', 'rien de spécial', ['reply']),
  L('Fan nga dëkk ?', 'tu habites où ?', ['ask']),
  L('Naka nga tudd ?', 'comment tu t’appelles ?', ['ask']),
  L('Fan nga dem ?', 'tu vas où ?', ['ask', 'transport']),
  // Invitations
  L('Kaay lekk', 'viens manger', ['invite', 'food']),
  L('Kaay fi', 'viens ici', ['invite']),
  L('Toogal', 'assieds-toi', ['invite']),
  L('Kaay naan attaya', 'viens boire l’attaya', ['invite', 'attaya']),
  L('Nanu dem', 'on y va', ['invite', 'chat', 'transport']),
  // Car rapide: the apprentice and the passengers
  L('Am na place', 'il y a de la place', ['transport']),
  L('Dinaa wàcc', 'je descends', ['transport']),
  // Market and bargaining
  L('Ñaata la ?', 'c’est combien ?', ['market', 'ask']),
  L('Wàññi ko tuuti', 'baisse un peu', ['market']),
  L('Seer na', 'c’est cher', ['market', 'money']),
  L('Yomb na', 'ce n’est pas cher', ['market', 'money']),
  L('Doy na', 'ça suffit', ['market', 'chat']),
  L('Jox ma', 'donne-moi', ['market', 'ask']),
  L('tuuti', 'un peu', ['market', 'word']),
  L('waxaale', 'marchander', ['market', 'word']),
  L('marse', 'marché', ['market', 'word']),
  L('bitig', 'boutique', ['market', 'word']),
  L('mburu', 'pain', ['food', 'market', 'word']),
  L('meew', 'lait', ['food', 'market', 'word']),
  L('Mburu ak meew', 'pain et lait', ['food', 'market']),
  L('ceeb', 'riz', ['food', 'market', 'word']),
  L('suukar', 'sucre', ['food', 'attaya', 'word']),
  // Food and attaya
  L('Dama xiif', 'j’ai faim', ['food']),
  L('Dama mar', 'j’ai soif', ['food']),
  L('Dama suur', 'j’ai bien mangé', ['food']),
  L('Neex na', 'c’est bon', ['food', 'chat']),
  L('lekk', 'manger', ['food', 'word']),
  L('naan', 'boire', ['food', 'word']),
  K('ceebu jën', 'riz au poisson', ['food', 'word']),
  L('Jën bu bees', 'poisson frais', ['food', 'sea', 'market']),
  K('attaya', 'thé vert à la menthe, servi en trois verres', ['attaya', 'word']),
  // Work and money
  L('liggéey', 'travail', ['work', 'word']),
  L('xaalis', 'argent', ['money', 'word']),
  L('góor-góorlu', 'se débrouiller', ['work', 'money', 'word']),
  L('Dama sonn', 'je n’en peux plus', ['work']),
  // Encouragement
  L('Baax na', 'c’est bien', ['encourage', 'chat']),
  L('Bul tiit', 'n’aie pas peur', ['encourage']),
  L('Ndank ndank', 'petit à petit', ['encourage', 'reply']),
  L('Amul solo', 'pas de souci', ['encourage', 'chat']),
  L('Xaaral tuuti', 'attends un peu', ['chat']),
  L('Gaawal', 'dépêche-toi', ['encourage']),
  L('Benn, ñaar, ñett', 'un, deux, trois', ['encourage', 'word']),
  // Làmb and the arena
  L('làmb', 'lutte sénégalaise', ['lamb', 'word']),
  L('mbër', 'lutteur', ['lamb', 'word']),
  L('bàkk', 'chant de lutteur', ['lamb', 'word']),
  L('mbapatt', 'lutte sans frappe', ['lamb', 'word']),
  L('daan', 'terrasser', ['lamb', 'word']),
  L('daanu', 'tomber', ['lamb', 'word']),
  L('jàpp', 'saisir', ['lamb', 'word']),
  L('géew', 'le cercle de l’arène', ['lamb', 'word']),
  L('ngemb', 'pagne de lutteur', ['lamb', 'word']),
  L('Daan naa', 'j’ai gagné', ['lamb']),
  L('Daan na', 'il a gagné', ['lamb']),
  // the wrestlers' entrance (src/arena/ceremony.ts): a boast about oneself, a chant, never against anyone
  L('doole', 'force', ['lamb', 'word']),
  L('Dama am doole', 'j’ai de la force', ['lamb', 'encourage']),
  L('gaynde', 'lion', ['lamb', 'word']),
  L('gox', 'quartier', ['word']),
  L('Sama gox', 'mon quartier', ['family', 'chat']),
  // Weather and heat
  L('Dafa tàng', 'il fait chaud', ['weather', 'chat']),
  L('Dafa sedd', 'il fait frais', ['weather']),
  L('naaj', 'le soleil qui tape', ['weather', 'word']),
  L('nawet', 'hivernage, saison des pluies', ['weather', 'word']),
  L('taw', 'pluie', ['weather', 'word']),
  L('ngelaw', 'vent', ['weather', 'word']),
  // Family and people
  L('yaay', 'maman', ['family', 'word']),
  L('baay', 'papa', ['family', 'word']),
  L('maam', 'grand-parent', ['family', 'word']),
  L('doom', 'enfant', ['family', 'word']),
  L('Sama doom', 'mon enfant', ['family']),
  L('mag', 'aîné', ['family', 'word']),
  L('rakk', 'cadet', ['family', 'word']),
  L('waa kër', 'les gens de la maison', ['family', 'word']),
  L('Sama xarit', 'mon ami', ['family', 'chat']),
  L('xale yi', 'les enfants', ['family', 'word']),
  L('kër', 'maison', ['family', 'word']),
  L('teraanga', 'hospitalité', ['blessing', 'word']),
  L('jàmm', 'la paix', ['blessing', 'word']),
  // The sea
  L('géej', 'mer', ['sea', 'word']),
  L('gaal', 'pirogue', ['sea', 'word']),
  // Quick reactions
  L('Dëgg la', 'c’est vrai', ['chat']),
  L('Dégg naa', 'j’ai compris', ['chat']),
  L('Ndeysaan', 'le pauvre !', ['chat']),
  L('Rafet na', 'c’est beau', ['chat']),
  L('Maa ngi ñëw', 'j’arrive', ['chat', 'transport']),
  L('rekk', 'seulement', ['word']),
  // Proverbs (well-known ones only)
  L('Nit nitay garabam', 'l’homme est le remède de l’homme', ['proverb']),
  L('Ndank ndank mooy jàpp golo ci ñaay', 'doucement, doucement, on attrape le singe dans la forêt', ['proverb', 'encourage']),
];

// ------------------------------------------------------------------ lookup

/** Case-insensitive key, ignoring final punctuation and spaces (« Na nga def ? » = « na nga def »). */
const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/[\s?!.…,;:]+$/u, '').trim();
const INDEX = new Map(LEXICON.map(e => [norm(e.wo), e]));

/** The lexicon entry for a phrase, or null. */
export const find = (wo: string): Lex | null => INDEX.get(norm(wo)) ?? null;
/** The lexicon entry for a phrase. Never throws: an unknown phrase comes back with an empty gloss (tests list them). */
export const lex = (wo: string): Lex => find(wo) ?? { wo, fr: '', tags: [] };
export const byTag = (tag: Tag): Lex[] => LEXICON.filter(e => e.tags.includes(tag));
/** The usual answer to a phrase (greeting → reply), or null. */
export const replyTo = (wo: string): Lex | null => { const r = lex(wo).reply; return r ? find(r) : null; };


// ------------------------------------------------------------------ time of day

const hourOf = (hour: number) => ((Math.floor(hour) % 24) + 24) % 24;
/** Greeting for the city hour: « Na nga fanaane ? » in the morning, « Na nga def ? » in the afternoon, « Na nga yendoo ? » in the evening. */
export function greetingAt(hour: number): Lex {
  const h = hourOf(hour);
  return lex(h >= 5 && h < 12 ? 'Na nga fanaane ?' : h >= 12 && h < 17 ? 'Na nga def ?' : 'Na nga yendoo ?');
}
/** Leave-taking for the city hour: good night after 20 h, « Ba ci kanam » otherwise. */
export const farewellAt = (hour: number): Lex => lex(hourOf(hour) >= 20 || hourOf(hour) < 5 ? 'Fanaanal ak jàmm' : 'Ba ci kanam');
/** Placeholder in a dialogue line for the greeting of the hour (resolved with `withHourGreeting`). */
export const HOUR_GREETING = '{salut}';
export const withHourGreeting = (line: string, hour: number): string =>
  (line.includes(HOUR_GREETING) ? line.split(HOUR_GREETING).join(say(greetingAt(hour).wo)) : line);
/** A greeting and its usual answer. */
export function greetingPair(hour: number): { ask: Lex; reply: Lex } {
  const ask = greetingAt(hour);
  return { ask, reply: replyTo(ask.wo) ?? lex('Jàmm rekk') };
}

// ------------------------------------------------------------------ seeded choice

/** FNV-1a hash of a seed, then mixed (murmur3 finaliser) so close seeds (« placed:1 », « placed:2 ») spread well:
 * the same seed always gives the same expression. */
export function seedHash(seed: string | number): number {
  let h = 0x811c9dc5;
  for (const ch of String(seed)) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
/** A random-but-seeded expression with this tag (e.g. seed = npc id + city day). */
export function pick(tag: Tag, seed: string | number): Lex {
  const list = byTag(tag);
  return list.length ? list[seedHash(`${tag}:${seed}`) % list.length] : lex('Jàmm rekk');
}

// ------------------------------------------------------------------ glosses

/**
 * A gloss travels inside the text between two invisible marks (U+2063 … U+2064) and is resolved at display time
 * (`glossed`, called by the HUD menus and toasts), so the Réglages switch applies to every line at once.
 * Unresolved, the marks are invisible and the gloss simply shows.
 */
const G0 = '\u2063', G1 = '\u2064';
const GLOSS_RE = /\u2063( \([^\u2064]*\))\u2064/g;
const GLOSS_KEY = 'dakarrek.wolof.gloss';

/** « Wolof (français) » inline; without a gloss, the Wolof alone. */
export const wo = (text: string, fr?: string): string => (fr ? `${text}${G0} (${fr})${G1}` : text);
/** The French gloss of a phrase, or '' when it is unknown or known by every player (« Salaam aleekum »). */
export const glossOf = (phrase: string): string => { const e = find(phrase); return e && !e.known ? e.fr : ''; };
/** A lexicon phrase with its gloss, written as given (capitalised or not). */
export const say = (phrase: string): string => wo(phrase, glossOf(phrase));
/** The same between French quotes, gloss outside: « Ñaata la ? » (c’est combien ?). */
export const quote = (phrase: string): string => wo(`« ${phrase} »`, glossOf(phrase));

function storage(): Storage | null {
  try { return (globalThis as { localStorage?: Storage }).localStorage ?? null; } catch { return null; }
}
function readGloss(): boolean {
  try { return storage()?.getItem(GLOSS_KEY) !== 'off'; } catch { return true; }
}
let glossOn = readGloss();
/** Whether French glosses are shown (Réglages › Langue, kept on this device). */
export const glossesShown = () => glossOn;
export function setGlossesShown(on: boolean) {
  glossOn = on;
  try { storage()?.setItem(GLOSS_KEY, on ? 'on' : 'off'); } catch { /* this session only */ }
}
/** Text ready to display: glosses shown « Jërëjëf (merci) » or hidden « Jërëjëf ». */
export const glossed = (text: string, on = glossOn): string => (text.includes(G0) ? text.replace(GLOSS_RE, on ? '$1' : '') : text);
