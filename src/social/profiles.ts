import type { Needs } from '../core/types';
import type { PersonLook } from '../actors/humanoid';
import type { Activity } from './routines';
import { HOUR_GREETING as SALUT, lex, quote, say, type Lex } from '../i18n/wolof';

/**
 * Character sheets of the recurring cast (texts, jobs, origins, households, humour).
 * States and effects come first (reactions, introductions, remembered facts); biographies stay short on purpose.
 * Languages: French dialogue with everyday Wolof mixed in, the way Dakar speaks; every Wolof phrase comes from
 * src/i18n/wolof.ts (`say` adds the French gloss, `SALUT` is the greeting of the hour). No other national language is
 * written for now: a sheet may say in French that someone speaks Pulaar, Sérère or Diola at home. No comic accents:
 * a way of speaking is described, never spelled phonetically. No community is tied to one job: the Diallo family has
 * a shopkeeper and a student; Ndeye (Sérère) runs a couture workshop; Peul and non-Peul traders sit side by side.
 */

/** A condition on what the character remembers or is doing now (all given fields must hold). */
export interface Cond {
  flag?: string; noFlag?: string;
  beat?: string; noBeat?: string;
  /** The player is a regular (flag regular_<id>). */
  regular?: boolean;
  /** City hours [from, to). */
  hours?: [number, number];
  relAtLeast?: number; relBelow?: number;
  /** What the character is doing now (routine activity). */
  act?: Activity[];
  /** counters[name] >= n */
  counter?: [string, number];
}
export interface Reaction {
  when: Cond; line: string;
  /** Small effect when the line greets a counted visit (at most once per city hour). */
  effect?: { needs?: Partial<Needs> };
}
export interface Intro { to: string; when: Cond[]; flag: string; line: string }
export interface Fact { when: Cond; text: string }
export interface Perk { id: string; label: string; detail: string; cost?: number; needs: Partial<Needs>; seconds: number; counter?: string; flags: string[] }

export interface Profile {
  id: string; age: number; origin: string;
  household: string; job: string; hours: string;
  languages: string; speech: string;
  /** Wolof expressions they use, from the lexicon (shown on their sheet with the gloss). */
  expressions: Lex[];
  ambition: string; difficulty: string;
  /** Two relations at least: [cast id, why]. */
  relations: [string, string][];
  /** What the player can see them do during the day. */
  visible: string[];
  humour: string;
  looks: { base: PersonLook; work?: PersonLook; train?: PersonLook; evening?: PersonLook };
  /** Interactable id prefix of the place they run: services bought there count as visits for memory. */
  place?: string;
  /** NPC menu base actions. */
  menu: 'ibou' | 'chat';
  /** A regular's favour, added to their place (or their own menu), shown when one of `flags` is set. */
  perk?: Perk;
  /** Goods always on sale at their place (flags: []). */
  sells?: Perk[];
  /** Ordered: the first matching reaction greets the player. */
  reactions: Reaction[];
  intros?: Intro[];
  /** Ordered from first met to most advanced: the last true fact is "the last thing they remember". */
  memories: Fact[];
}

const ex = (...phrases: string[]) => phrases.map(lex);

export const PROFILES: Profile[] = [
  {
    id: 'ibou', age: 64, origin: 'Pikine depuis 1975', household: 'Sa femme Ndèye, deux petits-enfants, un fils à Thiès',
    job: 'Cheminot à la retraite, « maire officieux » du quartier', hours: 'Café le matin, attaya le soir',
    languages: 'Wolof, français', speech: 'Lent, posé, beaucoup de « mon fils », de petites leçons de vie et des taquineries sur la mousse du thé.',
    expressions: ex('Na nga fanaane ?', 'Toogal', 'Kaay lekk', 'Nit nitay garabam'),
    ambition: 'Finir l’étage de sa maison avant le mariage de sa petite-fille.', difficulty: 'Sa pension arrive en retard et le toit fuit à chaque hivernage.',
    relations: [['modou', 'ami d’enfance'], ['mamadou', 'compagnon d’attaya'], ['ousmane', 'cousin, au port de Ngor']],
    visible: ['café Touba le matin', 'passe à la boutique Diallo', 'déjeune à la Maïga', 'attaya sur la grand-place le soir'],
    humour: 'Se moque gentiment de ceux qui quittent l’attaya trop tôt ; Mamadou lui reproche de trop sucrer.',
    looks: { base: { skin: 0x5b3420, style: 'boubou', top: 0xf2f2ec, pattern: 'bazin', hat: 'kufi', hatColor: 0xd9d2c4, beard: 0xd8d4cc, heavy: 0.4 }, evening: { skin: 0x5b3420, style: 'boubou', top: 0x9cc8e8, pattern: 'bazin', hat: 'kufi', hatColor: 0xf2f2ec, beard: 0xd8d4cc, heavy: 0.4 } },
    menu: 'ibou',
    reactions: [
      { when: { noBeat: 'ibou_welcome' }, line: 'Salaam aleekum ! Te voilà enfin ! Viens, que je te présente le quartier.' },
      { when: { act: ['attaya'] }, line: `${say('Toogal')}, la théière chauffe. Le premier verre est pour celui qui arrive.`, effect: { needs: { social: 4 } } },
      { when: { flag: 'reco_modou', noBeat: 'modou_reco' }, line: 'Alors, tu es passé voir Modou ? Il t’attend, je lui ai parlé de toi.' },
      { when: { flag: 'modou_trust', regular: true }, line: `Modou dit que tu travailles bien. ${say('Baax na')}, mon fils : tu ne m’as pas fait honte.` },
      { when: { act: ['eat'] }, line: `${say('Kaay lekk')} ! Pousse-toi un peu, Modou, fais de la place.` },
      { when: { regular: true, hours: [5, 12] }, line: `${say('Na nga fanaane ?')} Mon voisin préféré ! Ta lumière était allumée tard hier soir…` },
      { when: { regular: true }, line: `${say('Jàmm nga am ?')} Ah, l’habitué ! Ici, on te connaît maintenant.` },
      { when: {}, line: `${SALUT} Le quartier est calme aujourd’hui. Enfin… calme pour Pikine.` },
    ],
    intros: [{ to: 'mamadou', when: [{ regular: true, beat: 'ibou_welcome' }], flag: 'intro_mamadou', line: 'Va voir Mamadou Diallo, à la boutique près de la grand-place. C’est mon compagnon d’attaya, et il a besoin de bras.' }],
    memories: [
      { when: { beat: 'ibou_welcome' }, text: 'T’a accueilli dans le quartier' },
      { when: { flag: 'reco_modou' }, text: 'T’a recommandé à Modou' },
      { when: { counter: ['sit_attaya_place_n', 1] }, text: 'A partagé l’attaya avec toi sur la grand-place' },
      { when: { flag: 'info_ousmane' }, text: 'T’a parlé de son cousin Ousmane' },
    ],
  },
  {
    id: 'modou', age: 45, origin: 'Pikine', household: 'Sa femme Aminata et quatre enfants',
    job: 'Garagiste, patron du Garage Modou', hours: '7 h – 19 h, pause à la Maïga',
    languages: 'Wolof, français technique', speech: 'Direct, phrases courtes, compare tout à des moteurs.',
    expressions: ex('Kaay fi', 'Naka liggéey bi ?', 'Ndank ndank'),
    ambition: 'Acheter une valise de diagnostic pour les voitures récentes.', difficulty: 'Les pièces coûtent cher et son apprenti est parti.',
    relations: [['ibou', 'ami d’enfance'], ['babacar', 'ancien apprenti devenu lutteur']],
    visible: ['travaille devant le garage', 'déjeune à la Maïga', 'attaya avec Ibou après 19 h'],
    humour: 'Râle contre « les mauvais conducteurs », c’est-à-dire tout le monde.',
    looks: { base: { skin: 0x6b3f25, style: 'tee', top: 0x3c4a5c, bottom: 0x3c4a5c, muscular: 0.3 }, evening: { skin: 0x6b3f25, style: 'boubou', top: 0x27407a, pattern: 'uni', heavy: 0.2 } },
    place: 'pikine:garage', menu: 'chat',
    reactions: [
      { when: { flag: 'reco_modou', noBeat: 'modou_reco' }, line: 'Salaam aleekum. Ibou m’a prévenu que tu passerais. Entre, n’aie pas peur du cambouis.' },
      { when: { act: ['attaya'] }, line: 'Le soir, je laisse les moteurs. Ibou fait l’attaya, moi je fais les commentaires.' },
      { when: { act: ['eat'] }, line: 'Ici on mange vite : les voitures n’attendent pas.' },
      { when: { flag: 'modou_trust', regular: true }, line: `${say('Naka liggéey bi ?')} Mon meilleur aide ! Continue et je te confie les clés… d’une voiture, déjà.` },
      { when: { flag: 'modou_trust' }, line: `${say('Kaay fi')} ! Tu tombes bien, une boîte de vitesses t’attend.` },
      { when: { hours: [7, 10] }, line: `Le matin, c’est l’heure des pannes de démarrage. Tout le monde arrive en poussant, ${say('ndank ndank')}.` },
      { when: {}, line: `${SALUT} Garage Modou : tout se répare. Sauf les mauvais conducteurs.` },
    ],
    memories: [
      { when: { flag: 'modou_trust' }, text: 'T’embauche au tarif de confiance' },
      { when: { counter: ['served_modou', 3] }, text: 'T’a vu travailler au garage plusieurs fois' },
    ],
  },
  {
    id: 'mame', age: 52, origin: 'Kaolack, à Pikine depuis vingt ans', household: 'Veuve, deux filles qui l’aident au service',
    job: 'Cuisinière, Gargote Mame Diarra', hours: '6 h – 21 h, elle mange à 15 h',
    languages: 'Wolof, un peu de français', speech: 'Maternelle et autoritaire à la fois ; appelle tout le monde « sama doom » (mon enfant).',
    expressions: ex('Kaay lekk', 'Sama doom', 'Neex na'),
    ambition: 'Ouvrir une vraie salle avec des tables à l’intérieur.', difficulty: 'Le gaz augmente et des clients mangent à crédit.',
    relations: [['babacar', 'elle nourrit l’écurie'], ['mamadou', 'il lui livre le riz']],
    visible: ['sert devant la gargote', 'mange enfin assise vers 15 h'],
    humour: 'Menace de « mettre au travail » ceux qui reviennent trop souvent.',
    looks: { base: { skin: 0x7a4a2c, female: true, style: 'dress', top: 0xe58a2f, pattern: 'wax', accent: 0xf6e7c1, hat: 'headwrap', hatColor: 0xe7b82f, heavy: 0.6 } },
    place: 'pikine:gargote', menu: 'chat',
    perk: { id: 'mame_habitue', label: 'Le plat de l’habitué', detail: 'Mame te reconnaît : une louche de plus', cost: 900, needs: { faim: 55, moral: 8, social: 4 }, seconds: 3, counter: 'meals', flags: ['regular_mame'] },
    reactions: [
      { when: { flag: 'mame_helped', regular: true }, line: 'Mon habitué ! Ta place est gardée, et la louche est plus généreuse pour toi.' },
      { when: { flag: 'mame_helped' }, line: `${say('Kaay lekk')} ! Toi qui m’as porté la bonbonne, ici tu manges à prix d’ami. Je n’oublie pas.` },
      { when: { act: ['eat'] }, line: `Laisse-moi manger cinq minutes, ${say('sama doom')}. Ma fille t’apporte ton plat.` },
      { when: { regular: true }, line: `Encore toi ? Te voilà un habitué : ${say('neex na')}, avoue. Comme d’habitude ?` },
      { when: { hours: [6, 11] }, line: 'Le ceebu jën n’est pas encore prêt. Reviens à midi, tu ne le regretteras pas.' },
      { when: {}, line: `${say('Kaay lekk')}, ${say('sama doom')} ! Assieds-toi, ça mange bien chez Mame Diarra.` },
    ],
    intros: [{ to: 'mamadou', when: [{ regular: true }], flag: 'intro_mamadou', line: 'Tu connais Mamadou Diallo, de la Boutique Diallo ? Il me livre le riz. Va le voir de ma part, il cherche quelqu’un de sérieux.' }],
    memories: [
      { when: { flag: 'mame_helped' }, text: 'Se souvient que tu as porté sa bonbonne de gaz' },
      { when: { flag: 'mamadou_trust' }, text: 'A reçu le riz que tu as livré' },
    ],
  },
  {
    id: 'ablaye', age: 48, origin: 'Pikine, ancien lutteur', household: 'Marié, trois enfants ; l’écurie est sa deuxième famille',
    job: 'Coach de l’écurie Baobab (fictive)', hours: '6 h – 11 h et 15 h – 19 h à l’écurie',
    languages: 'Wolof, français', speech: 'Sobre, exigeant, parle de respect et de patience. Ne crie jamais.',
    expressions: ex('Ndank ndank', 'Bul tiit', 'Ndank ndank mooy jàpp golo ci ñaay'),
    ambition: 'Former un champion sorti du quartier.', difficulty: 'Pas d’argent pour le sable neuf et les jeunes partent vers des écuries plus riches.',
    relations: [['babacar', 'coach et élève'], ['lamine', 'écurie rivale'], ['ibou', 'vieil ami du quartier']],
    visible: ['dirige l’entraînement', 'déjeune chez Mame Diarra', 'discute devant l’arène le soir'],
    humour: 'Ironie sèche : « Tu as le gabarit. Reste à voir si tu as la patience. »',
    looks: { base: { skin: 0x4e2e1c, style: 'tee', top: 0x1a7a44, bottom: 0x2b2b33, muscular: 0.6, beard: 0x8a8580 } },
    place: 'pikine:ecurie', menu: 'chat',
    reactions: [
      { when: { flag: 'ecurie_baobab', counter: ['lutte', 5] }, line: `${say('Ndank ndank')}, tu commences à avoir des appuis. Ne le dis pas aux autres, ils seraient jaloux.` },
      { when: { flag: 'rival_lamine', act: ['chat'] }, line: `Lamine est là-bas, il parle encore. ${say('Bul tiit')} : on répond sur le sable.` },
      { when: { act: ['eat'] }, line: 'Même un coach doit manger. Mame Diarra veille sur toute l’écurie.' },
      { when: { flag: 'ecurie_baobab' }, line: 'Échauffement, puis prises. Et en arrivant, on salue les anciens : « Salaam aleekum », pas « salut ».' },
      { when: {}, line: `Tu as le gabarit. Reste à voir si tu as la patience : ${say('ndank ndank mooy jàpp golo ci ñaay')}.` },
    ],
    memories: [
      { when: { flag: 'ecurie_baobab' }, text: 'T’a accepté à l’écurie Baobab' },
      { when: { flag: 'meet_lamine' }, text: 'T’a présenté à Lamine, le rival' },
      { when: { counter: ['victoires', 1] }, text: 'A vu ta première victoire' },
    ],
  },
  {
    id: 'babacar', age: 24, origin: 'Pikine', household: 'Vit chez sa mère avec trois frères',
    job: 'Lutteur à l’écurie Baobab ; ancien apprenti mécanicien', hours: 'Entraînement 6 h – 10 h et 15 h – 19 h',
    languages: 'Wolof, français de la rue', speech: 'Rapide, enthousiaste, se voit déjà en haut de l’affiche.',
    expressions: ex('Lu bees ?', 'Xaaral tuuti', 'Dama xiif', 'Daan naa'),
    ambition: 'Décrocher son premier grand combat.', difficulty: 'Pas un franc entre deux combats ; il mange souvent à crédit.',
    relations: [['ablaye', 'son coach'], ['lamine', 'rival'], ['modou', 'ancien patron au garage']],
    visible: ['s’entraîne à l’écurie', 'déjeune à la Maïga', 'traîne devant l’arène le soir'],
    humour: 'Se vante, puis avoue qu’il n’a pas de quoi payer son plat.',
    looks: { base: { skin: 0x5b3420, style: 'tee', top: 0xf2f2ec, bottom: 0x2b2b33, muscular: 1 }, train: { skin: 0x5b3420, style: 'tee', top: 0x1a7a44, bottom: 0x1c1c1f, muscular: 1 } },
    menu: 'chat',
    reactions: [
      { when: { flag: 'babacar_doit', noFlag: 'babacar_rendu' }, line: `${say('Jërëjëf')} encore, hein. Je n’oublie pas le repas de la Maïga, je te revaudrai ça.` },
      { when: { flag: 'fete_baobab' }, line: 'Tu as dansé avec nous ! Tout Pikine en parle encore.' },
      { when: { act: ['train'] }, line: `${say('Xaaral tuuti')}, Coach compte les séries… Bon, deux minutes.` },
      { when: { act: ['eat'] }, line: `${say('Neex na')} ! Le mafé de la Maïga, c’est mon carburant.` },
      { when: { relBelow: -5 }, line: 'Tu veux quoi ?' },
      { when: {}, line: `${say('Lu bees ?')} Un jour, mon nom sera sur toutes les affiches de l’arène. Retiens-le.` },
    ],
    memories: [
      { when: { flag: 'babacar_doit' }, text: 'Tu lui as payé son repas à la Maïga' },
      { when: { flag: 'babacar_rendu' }, text: 'T’a rendu la pareille' },
      { when: { flag: 'fete_baobab' }, text: 'A fêté sa victoire avec toi' },
    ],
  },
  {
    id: 'lamine', age: 26, origin: 'Guédiawaye', household: 'Marié depuis peu',
    job: 'Lutteur de l’écurie Teranga (fictive)', hours: 'S’entraîne devant l’arène, sort le soir',
    languages: 'Wolof, français', speech: 'Fanfaron, provocateur, mais jamais grossier ; adore le public.',
    expressions: ex('Waaw kay', 'mbër', 'bàkk'),
    ambition: 'Devenir une tête d’affiche connue dans tout Dakar.', difficulty: 'Son promoteur a annulé son dernier combat.',
    relations: [['babacar', 'rival'], ['ablaye', 'le coach adverse']],
    visible: ['s’entraîne devant l’arène', 'café Touba à midi', 'devant la dibiterie le soir'],
    humour: 'Provoque, mais reconnaît un adversaire poli.',
    looks: { base: { skin: 0x4e2e1c, style: 'tee', top: 0xd9322b, bottom: 0x1c1c1f, muscular: 0.9 } },
    menu: 'chat',
    reactions: [
      { when: { relBelow: -10 }, line: 'Tiens, celui qui parle beaucoup. Tu viens prendre une leçon ?' },
      { when: { flag: 'rival_lamine', counter: ['victoires', 1] }, line: `On m’a parlé de ta victoire. ${say('Waaw kay')}… contre un débutant, j’imagine.` },
      { when: { flag: 'rival_lamine' }, line: `Toujours chez Baobab ? Dommage pour toi. Chez Teranga, un vrai ${say('mbër')}, ça se forme depuis l’enfance.` },
      { when: { act: ['train'] }, line: 'Regarde bien. Aujourd’hui c’est gratuit.' },
      { when: {}, line: `Lamine, écurie Teranga. Retiens le nom : bientôt, tout Dakar connaîtra mon ${say('bàkk')}.` },
    ],
    memories: [{ when: { flag: 'rival_lamine' }, text: 'T’a rencontré devant l’arène' }],
  },
  {
    id: 'mamadou', age: 51, origin: 'Peul, né près de Podor ; à Pikine depuis 1998', household: 'Sa femme Coumba, trois enfants ; son frère Thierno tient le comptoir avec lui',
    job: 'Boutiquier, Boutique Diallo (Pikine)', hours: '7 h – 22 h, pause attaya de 17 h à 19 h',
    languages: 'Pulaar en famille, wolof avec les clients, français pour les fournisseurs', speech: 'Courtois, mesuré, cite les chiffres de mémoire ; humour pince-sans-rire sur son carnet de crédit.',
    expressions: ex('Dalal ak jàmm', 'Na nga def ?', 'Mburu ak meew', 'Yomb na'),
    ambition: 'Passer au demi-gros et ouvrir une deuxième boutique près de la gare.', difficulty: 'Le carnet de crédit déborde et le grossiste a augmenté le sucre.',
    relations: [['kadiatou', 'sa nièce, étudiante à Fann'], ['ibou', 'compagnon d’attaya'], ['mame', 'il lui livre le riz']],
    visible: ['sert au comptoir', 'mange derrière le comptoir à 13 h', 'attaya avec Ibou sur la grand-place'],
    humour: 'Reproche à Ibou de trop sucrer le thé ; écrit « même les bonbons » dans son carnet.',
    looks: { base: { skin: 0x6b3f25, style: 'boubou', top: 0x27407a, pattern: 'uni', hat: 'kufi', hatColor: 0xf2f2ec, beard: 0x1a1414, heavy: 0.2 }, evening: { skin: 0x6b3f25, style: 'boubou', top: 0xe8e2d4, pattern: 'bazin', hat: 'kufi', hatColor: 0xf2f2ec, beard: 0x1a1414, heavy: 0.2 } },
    place: 'pikine:city:boutique', menu: 'chat',
    sells: [{ id: 'sucre', label: 'Sucre et thé pour l’attaya', detail: 'Un paquet de sucre, un paquet de thé vert', cost: 300, needs: { moral: 2 }, seconds: 1.5, counter: 'sucre', flags: [] }],
    perk: { id: 'sucre_voisin', label: 'Sucre et thé · prix de voisin', detail: 'Pour l’attaya · Mamadou te fait le prix des habitués', cost: 200, needs: { moral: 2 }, seconds: 1.5, counter: 'sucre', flags: ['regular_mamadou', 'mamadou_trust'] },
    reactions: [
      { when: { flag: 'kadiatou_carnet' }, line: 'Kadiatou m’a raconté que tu parles de mon carnet. Méfie-toi : j’y note aussi les moqueurs.' },
      { when: { flag: 'info_livraison', noBeat: 'mamadou_livraison' }, line: 'Alors, ces sacs de riz ? Ils ne vont pas marcher tout seuls jusque chez Mame.' },
      { when: { act: ['attaya'] }, line: 'Ibou met trop de sucre. Je le lui dis depuis vingt ans, il ne m’écoute pas.' },
      { when: { act: ['eat'] }, line: 'Je mange derrière le comptoir : un client peut arriver à tout moment.' },
      { when: { flag: 'mamadou_trust', regular: true }, line: `${say('Na nga def ?')} Mon livreur et client fidèle ! Ton sucre est prêt, au prix de voisin : ${say('yomb na')}.` },
      { when: { regular: true }, line: `Salaam aleekum ! Je connais tes habitudes maintenant : ${say('mburu ak meew')}, et pas de crédit.` },
      { when: {}, line: `${say('Dalal ak jàmm')} ! Entre, regarde. Tout ce qui est noté dans ce carnet est payé… presque tout.` },
    ],
    intros: [{ to: 'kadiatou', when: [{ regular: true }, { flag: 'mamadou_trust' }], flag: 'intro_kadiatou', line: 'Ma nièce Kadiatou étudie à Fann. Elle cherche des gens pour son enquête sur les boutiques. Passe à la place des étudiants, dis-lui que c’est moi qui t’envoie.' }],
    memories: [
      { when: { flag: 'info_livraison' }, text: 'T’a parlé d’une livraison pendant l’attaya' },
      { when: { flag: 'mamadou_trust' }, text: 'A noté ton nom « du bon côté » du carnet' },
      { when: { flag: 'kadiatou_carnet' }, text: 'Sait que tu te moques de son carnet' },
    ],
  },
  {
    id: 'kadiatou', age: 22, origin: 'Peul, de Pikine ; vit chez une tante à Fann', household: 'Chez sa tante à Fann ; nièce de Mamadou Diallo',
    job: 'Étudiante en licence d’économie (UCAD) — pas commerçante', hours: 'Révisions au café et sur la place des étudiants, sport le soir',
    languages: 'Français, wolof, pulaar en famille', speech: 'Vive, précise, pose des questions sur tout ; taquine son oncle.',
    expressions: ex('Fan nga dëkk ?', 'Jërëjëf', 'Dama sonn'),
    ambition: 'Devenir statisticienne.', difficulty: 'Son mémoire sur le crédit dans les boutiques manque de témoins, et la famille voudrait qu’elle aide à la boutique le week-end.',
    relations: [['mamadou', 'son oncle'], ['aida', 'révisent ensemble']],
    visible: ['révise au café Touba', 'déjeune à la Maïga de Fann', 'fiches sur la place des étudiants', 'entraînement sur la plage'],
    humour: '« Déformation professionnelle : j’interroge tout le monde. »',
    looks: { base: { skin: 0x7a4a2c, female: true, style: 'dress', top: 0x1f7a44, pattern: 'wax', accent: 0xf6e7c1, hat: 'headwrap', hatColor: 0xf4c20d }, train: { skin: 0x7a4a2c, female: true, style: 'tee', top: 0xf2f2ec, bottom: 0x2b3a55, hat: 'headwrap', hatColor: 0xf4c20d } },
    menu: 'chat',
    reactions: [
      { when: { flag: 'kadiatou_ndeye' }, line: `${say('Jërëjëf')} ! Ndeye m’a parlé deux heures. Mon chapitre sur la Médina est presque fini.` },
      { when: { flag: 'intro_kadiatou', noBeat: 'kadiatou_enquete' }, line: 'Tonton Mamadou t’envoie ? Alors j’ai des questions pour toi.' },
      { when: { act: ['train'] }, line: `${say('Dama sonn')} ! Moussa dit que c’est bon pour la mémoire. Moi je dis que c’est bon pour les crampes.` },
      { when: { flag: 'kadiatou_friend', regular: true }, line: 'Mon témoin préféré ! J’ai encore une petite question… ou dix.' },
      { when: { act: ['study'] }, line: 'Statistiques le matin, enquête l’après-midi. Le soir, je dors debout.' },
      { when: {}, line: `${say('Fan nga dëkk ?')} Et tu fais quoi dans la vie ? Pardon, déformation professionnelle : j’interroge tout le monde.` },
    ],
    memories: [
      { when: { flag: 'kadiatou_friend' }, text: 'Tu as répondu à son enquête' },
      { when: { flag: 'kadiatou_ndeye' }, text: 'Tu lui as présenté Ndeye' },
    ],
  },
  {
    id: 'ndeye', age: 41, origin: 'Sérère, de Fatick ; à la Médina depuis quinze ans', household: 'Mariée, deux enfants ; son apprenti Ousseynou',
    job: 'Couturière et commerçante, Atelier Ndeye (Médina)', hours: '8 h – 19 h, déjeune chez Fatou',
    languages: 'Sérère en famille, wolof, français', speech: 'Rapide, chaleureuse, négocie en riant ; donne des conseils de style sans qu’on demande.',
    expressions: ex('Dalal ak jàmm', 'Rafet na', 'Lu bees ?', 'Amul solo'),
    ambition: 'Avoir sa propre ligne de boubous vendue au mall.', difficulty: 'Les commandes des fêtes arrivent toutes la même semaine et le tissu augmente.',
    relations: [['adja', 'le tissu vient de Sandaga'], ['fatou', 'voisine, elle y déjeune']],
    visible: ['coud et sert à l’atelier', 'déjeune chez Fatou', 'place de la Médina avec Adja le soir'],
    humour: 'Juge les tenues des passants, avec tendresse.',
    looks: { base: { skin: 0x5b3420, female: true, style: 'dress', top: 0x6b3fa0, pattern: 'bazin', hat: 'headwrap', hatColor: 0xd9b44a, heavy: 0.3 } },
    place: 'plateau:city:boutique', menu: 'chat',
    perk: { id: 'retouche', label: 'Retouche à prix d’amie', detail: 'Ndeye reprend ta tenue', cost: 500, needs: { moral: 10, hygiene: 4 }, seconds: 3, flags: ['regular_ndeye', 'ndeye_trust'] },
    reactions: [
      { when: { flag: 'kadiatou_ndeye' }, line: 'Ta Kadiatou est passée avec son questionnaire. Elle écrit plus vite que je ne couds !' },
      { when: { act: ['chat'] }, line: 'Le soir, je laisse les aiguilles. Adja me raconte Sandaga, je lui raconte la Médina.' },
      { when: { flag: 'ndeye_trust', regular: true }, line: `Mon aide des grands jours ! Je te reprends cette chemise ? Prix d’amie. ${say('Rafet na')}, tu verras.` },
      { when: { flag: 'ndeye_trust' }, line: 'Les boubous du baptême ont été livrés à l’heure. Grâce à toi, en partie.' },
      { when: { regular: true }, line: `Encore toi ! ${say('Lu bees ?')} Tu viens pour la couture ou pour les nouvelles ?` },
      { when: {}, line: `${say('Dalal ak jàmm')} ! Un boubou, une retouche, un conseil ? Les conseils sont gratuits.` },
    ],
    memories: [
      { when: { flag: 'ndeye_trust' }, text: 'Tu l’as aidée avant le baptême' },
      { when: { flag: 'kadiatou_ndeye' }, text: 'A rencontré Kadiatou grâce à toi' },
    ],
  },
  {
    id: 'adja', age: 38, origin: 'Rufisque', household: 'Mariée, un fils au lycée',
    job: 'Commerçante en tissus, marché Sandaga', hours: '8 h – 18 h au marché',
    languages: 'Wolof, français', speech: 'Vendeuse née : « touche, touche ». Ne lâche jamais une négociation.',
    expressions: ex('Ñaata la ?', 'Wàññi ko tuuti', 'Déedéet', 'Dafa tàng'),
    ambition: 'Importer ses tissus elle-même.', difficulty: 'Son vendeur est souvent malade et le loyer de l’étal augmente.',
    relations: [['fatou', 'amie de Sandaga'], ['ndeye', 'cliente et amie']],
    visible: ['vend à Sandaga', 'déjeune chez Fatou', 'place de la Médina le soir'],
    humour: 'Vante ses tissus comme des trésors nationaux.',
    looks: { base: { skin: 0x6b3f25, female: true, style: 'dress', top: 0x7a5fd1, pattern: 'wax', accent: 0xf4c20d, hat: 'headwrap', hatColor: 0x7a5fd1 } },
    place: 'plateau:market', menu: 'chat',
    reactions: [
      { when: { flag: 'adja_trust', regular: true }, line: 'Mon vendeur préféré ! Les clientes demandent encore après toi.' },
      { when: { flag: 'ndeye_trust' }, line: 'Ndeye m’a dit que tu es venu chercher le fil pour elle. Tu connais tout le monde, toi.' },
      { when: { act: ['chat'] }, line: `${say('Dafa tàng')} ! Après Sandaga, la place de la Médina. Mes pieds me remercient.` },
      { when: { flag: 'adja_trust' }, line: 'Tu as bien vendu la dernière fois. Si mon vendeur retombe malade, je t’appelle.' },
      { when: {}, line: `Regarde ce tissu… Touche, touche. Tu vas me dire ${quote('Wàññi ko tuuti')} ? ${say('Déedéet')} : tu ne trouveras pas mieux à Sandaga !` },
    ],
    memories: [{ when: { flag: 'adja_trust' }, text: 'Tu as tenu son étal' }],
  },
  {
    id: 'fatou', age: 44, origin: 'Médina', household: 'Mariée, trois enfants',
    job: 'Gargote Chez Fatou (Plateau)', hours: '7 h – 21 h',
    languages: 'Wolof, français', speech: 'Généreuse, parle fort, tutoie tout de suite.',
    expressions: ex('Toogal', 'teraanga', 'Fanaanal ak jàmm', 'Dama suur'),
    ambition: 'Livrer des plats aux bureaux du Plateau.', difficulty: 'Une concurrente s’est installée juste en face.',
    relations: [['adja', 'amie de Sandaga'], ['ndeye', 'voisine de la Médina']],
    visible: ['sert à la gargote', 'mange à 15 h', 'place de la Médina après le service'],
    humour: '« Chez Fatou, on ne repart jamais le ventre vide. »',
    looks: { base: { skin: 0x8a5a3a, female: true, style: 'dress', top: 0xc2417f, pattern: 'wax', accent: 0xffffff, hat: 'headwrap', hatColor: 0xc2417f, heavy: 0.3 } },
    place: 'plateau:gargote', menu: 'chat',
    perk: { id: 'fatou_habitue', label: 'Plat et bissap de l’habitué', detail: 'Fatou ajoute le bissap', cost: 1000, needs: { faim: 48, moral: 10 }, seconds: 3, counter: 'meals', flags: ['regular_fatou'] },
    reactions: [
      { when: { flag: 'fatou_friend', regular: true }, line: 'Les amis d’Adja mangent bien, et les habitués mangent encore mieux.' },
      { when: { hours: [21, 24] }, line: `Le service est fini. Ce soir, c’est moi qui m’assieds. ${say('Fanaanal ak jàmm')} !` },
      { when: { flag: 'fatou_friend' }, line: `${say('Toogal')}, ami d’Adja. Le ceebu jën est prêt.` },
      { when: { regular: true }, line: `Tu reviens souvent : je vais finir par te mettre au travail. Alors, ${quote('Dama suur')} ou encore un peu ?` },
      { when: {}, line: `Ici, c’est la ${say('teraanga')} : chez Fatou, on ne repart jamais le ventre vide.` },
    ],
    intros: [{ to: 'ndeye', when: [{ regular: true }], flag: 'intro_ndeye', line: 'Ndeye, à l’atelier de la Médina, cherche toujours des bras avant les fêtes. Dis-lui que tu viens de chez Fatou.' }],
    memories: [{ when: { flag: 'fatou_friend' }, text: 'Te sert à prix d’ami (amie d’Adja)' }],
  },
  {
    id: 'moussa', age: 33, origin: 'Fann', household: 'Célibataire, vit avec ses parents',
    job: 'Coach sportif sur la Corniche', hours: '6 h – 11 h à la salle, 17 h – 20 h sur la plage',
    languages: 'Wolof, français', speech: 'Encourageant, compte tout à voix haute.',
    expressions: ex('Benn, ñaar, ñett', 'Baax na', 'Nanu dem', 'Bul tiit'),
    ambition: 'Ouvrir une vraie salle avec des machines.', difficulty: 'Ses clients paient au mois… quand ils pensent à payer.',
    relations: [['ablaye', 'se respectent'], ['aida', 'elle court avec son groupe']],
    visible: ['coache à la salle en plein air', 'déjeune à la Maïga de Fann', 'entraînement collectif sur la plage'],
    humour: 'Compare les débutants à des cars rapides essoufflés.',
    looks: { base: { skin: 0x5b3420, style: 'tee', top: 0xd9482b, bottom: 0x2b2b33, muscular: 0.7 } },
    place: 'corniche:gym', menu: 'chat',
    reactions: [
      { when: { counter: ['forme', 5] }, line: `${say('Baax na')} ! Tu tiens le rythme maintenant. Au début, tu soufflais comme un car rapide.` },
      { when: { act: ['coach'], hours: [17, 20] }, line: `Sur le sable, on travaille deux fois plus. ${say('Benn, ñaar, ñett')}… ${say('Nanu dem')}, rejoins le groupe !` },
      { when: { flag: 'reco_ablaye' }, line: 'Tu es allé voir Ablaye ? Dis-lui que Moussa salue l’écurie.' },
      { when: {}, line: `${SALUT} La Corniche au lever du soleil, il n’y a rien de mieux. ${say('Bul tiit')}, on commence doucement.` },
    ],
    memories: [{ when: { flag: 'reco_ablaye' }, text: 'T’a recommandé à Coach Ablaye' }],
  },
  {
    id: 'aida', age: 21, origin: 'Ziguinchor, étudiante à Dakar', household: 'Chambre en colocation à Fann',
    job: 'Étudiante en droit, serveuse au café Touba de Fann', hours: '7 h – 17 h au café, sport après',
    languages: 'Français, wolof, diola en famille', speech: 'Drôle, un peu fatiguée, toujours un café à la main.',
    expressions: ex('Na nga def ?', 'Dama sonn', 'Amul solo', 'Maa ngi ñëw'),
    ambition: 'Réussir le concours de la magistrature.', difficulty: 'Les heures au café mangent ses révisions.',
    relations: [['moussa', 'court avec son groupe'], ['kadiatou', 'révisent ensemble']],
    visible: ['sert au café', 'déjeune à la gargote des étudiants', 'révise sur la place', 'plage le soir'],
    humour: 'Menace d’abandonner le sport tous les soirs.',
    looks: { base: { skin: 0x7a4a2c, female: true, style: 'tee', top: 0x2f8fd1, bottom: 0x2b3a55, hair: 'puff' } },
    place: 'corniche:cafe', menu: 'chat',
    perk: { id: 'aida_tournee', label: 'Café Touba, la tournée d’Aïda', detail: 'Aïda te reconnaît : elle remplit bien le verre', cost: 50, needs: { energie: 8, moral: 7, social: 3 }, seconds: 1.5, counter: 'cafes', flags: ['regular_aida'] },
    reactions: [
      { when: { flag: 'aida_friend', regular: true }, line: `Mon binôme de révision ! Café comme d’habitude ? ${say('Maa ngi ñëw')}.` },
      { when: { flag: 'kadiatou_friend' }, line: 'Kadiatou dit que tu as répondu à son questionnaire. Tu es courageux.' },
      { when: { act: ['train'] }, line: `${say('Dama sonn')}… Encore deux tours et j’abandonne. Ne le dis pas à Moussa.` },
      { when: { act: ['study'] }, line: `Chut… Enfin, non, parle. ${say('Amul solo')}, j’ai besoin d’une pause.` },
      { when: {}, line: `${SALUT} Un café Touba ? Il réveille même les étudiants de première année.` },
    ],
    memories: [{ when: { flag: 'aida_friend' }, text: 'A révisé avec toi à l’UCAD' }],
  },
  {
    id: 'ousmane', age: 50, origin: 'Ngor', household: 'Marié, cinq enfants, dont deux pêcheurs',
    job: 'Chef de quai au port de Ngor', hours: '5 h – 18 h, pause chez Khady',
    languages: 'Wolof, français', speech: 'Bourru mais juste ; parle de la mer comme d’une voisine capricieuse.',
    expressions: ex('Jàmm nga am ?', 'Gaawal', 'Ndeysaan'),
    ambition: 'Remplacer le moteur de la grande pirogue.', difficulty: 'Les prises diminuent et le carburant augmente.',
    relations: [['ibou', 'cousin'], ['khady', 'il lui fournit le poisson']],
    visible: ['dirige le quai', 'livre le poisson au Pointe', 'place des voisins le soir'],
    humour: '« Celui de gauche triche aux dames, mais personne n’ose le dire. »',
    looks: { base: { skin: 0x4e2e1c, style: 'tee', top: 0xe7b82f, bottom: 0x2b3a55, hat: 'kufi', hatColor: 0x1e6fd9, muscular: 0.4, beard: 0x1a1414 } },
    place: 'almadies:port', menu: 'chat',
    reactions: [
      { when: { flag: 'info_ousmane', noFlag: 'ousmane_trust' }, line: 'Ibou m’a parlé de toi hier soir. Alors c’est toi, le voisin de mon cousin ?' },
      { when: { flag: 'ousmane_trust', hours: [5, 10] }, line: `La pirogue part bientôt. Tu viens, ou tu dors encore ? ${say('Gaawal')} !` },
      { when: { act: ['chat'], hours: [18, 21] }, line: `Regarde-les jouer aux dames. Celui de gauche triche, mais personne n’ose le dire. ${say('Ndeysaan')}, celui de droite.` },
      { when: { flag: 'ousmane_trust' }, line: 'Les gens de confiance, je ne les oublie pas.' },
      { when: {}, line: `${say('Jàmm nga am ?')} La mer était bonne ce matin. Pour les poissons, un peu moins.` },
    ],
    memories: [{ when: { flag: 'ousmane_trust' }, text: 'T’a fait monter sur la pirogue du matin' }],
  },
  {
    id: 'khady', age: 36, origin: 'Saint-Louis', household: 'Divorcée, une fille de dix ans',
    job: 'Gérante du restaurant Le Pointe', hours: '10 h – 23 h, pause à 16 h',
    languages: 'Français, wolof', speech: 'Professionnelle, efficace, humour sec avec les habitués.',
    expressions: ex('Dalal ak jàmm', 'liggéey', 'Jërëjëf'),
    ambition: 'Racheter le restaurant à son patron.', difficulty: 'Les serveurs ne restent jamais longtemps.',
    relations: [['ousmane', 'son fournisseur de poisson'], ['adja', 'elle lui achète les nappes']],
    visible: ['accueille au restaurant', 'pause sur le banc à 16 h'],
    humour: '« Assieds-toi, mais ne me parle pas de travail. »',
    looks: { base: { skin: 0x6b3f25, female: true, style: 'dress', top: 0xf3f0ea, pattern: 'uni', accent: 0x0c4a6e, hair: 'puff' } },
    place: 'almadies:restaurant', menu: 'chat',
    perk: { id: 'khady_maison', label: 'Bissap offert par la maison', detail: 'Pour les habitués du Pointe', needs: { faim: 6, moral: 8 }, seconds: 2, flags: ['regular_khady'] },
    reactions: [
      { when: { flag: 'khady_trust', regular: true }, line: 'Mon meilleur serveur d’un soir ! Les clients demandent quand tu reviens.' },
      { when: { act: ['eat'] }, line: `Ma seule pause de la journée. Assieds-toi, mais ne me parle pas de ${say('liggéey')}.` },
      { when: { flag: 'khady_trust' }, line: 'Les clients t’ont trouvé poli. Ici, c’est rare.' },
      { when: {}, line: `${say('Dalal ak jàmm')} ! Une table face à l’océan ? Pour toi, je trouve toujours une place.` },
    ],
    memories: [{ when: { flag: 'khady_trust' }, text: 'Tu as assuré un service du soir' }],
  },
];
export const profileOf = (id: string) => PROFILES.find(p => p.id === id);
