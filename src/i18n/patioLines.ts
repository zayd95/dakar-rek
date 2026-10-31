import { quote, say } from './wolof';
import { price } from './lines';
import { PATIO_DRINKS, PATIO_ENTRY, PATIO_HOURS, PATIO_NAME, PATIO_REGULAR, PATIO_THEMES } from '../venues/patioPlan';
import { clubTheme } from '../activity/templates';

/**
 * Everything Le Patio says (src/venues/patio.ts): the doorman, the barwoman, the DJ and the eight people who have a word for you. French with a little everyday Wolof in the style of the
 * club's lines (src/venues/talk.ts), written for the game; to read again with Habib and the Wolof lane. Adult, grounded, nothing explicit.
 *
 * The rules this file keeps — and tests/patioLines.test.ts holds it to:
 *  - every conversation has a respectful way to decline, and whoever it is accepts it gracefully and says so; nobody insists, presses, punishes or turns cold after a no;
 *  - nothing here sells, prices, negotiates or arranges a sexual service, and no choice moves money to or from a person: the only things the player pays for in Le Patio are the door, the bar
 *    and the DJ's request. An invitation to leave together can only be declined (there is no choice that accepts one);
 *  - Le Patio's night is known for its sex workers, who are among the people of the place like anyone: some of those who talk to you work the night there, and they say so themselves, as
 *    work, with their children, the police, the owner, safety. Who they are is declared by `role` below, never by how they look or dress (src/venues/patioPlan.ts `patioLook` takes neither);
 *    not every woman is a worker, and the people are of every age from 24 to 60;
 *  - no explicit content, no violence, no coercion, nobody under eighteen — the doorman asks for « 18 ans minimum ».
 */
export type Moment = 'early' | 'warm' | 'peak' | 'dawn';
export type ChoiceKind = 'topic' | 'flirt' | 'invite' | 'decline' | 'bye';
export interface Choice { id: string; kind: ChoiceKind; label: string; icon: string; reply: string; /** The reply invites the player to leave together: it can only be declined (there is no choice that accepts). */ together?: true }
/** What a person at Le Patio is, said by the data and nowhere else. */
export type PersonRole = 'patron' | 'worker';
export interface Talker {
  id: string; name: string; gender: 'f' | 'm'; age: number; role: PersonRole;
  /** What the sheet calls them before the name is known: where they are, nothing about who they are. */
  unknown: string;
  hello(first: boolean, m: Moment): string;
  /** What they say when they walk over to you (once a night, at most); absent: they stay where they are. */
  approach?: string;
  choices: readonly Choice[];
}
const C = (id: string, kind: ChoiceKind, icon: string, label: string, reply: string, together?: true): Choice => ({ id, kind, icon, label, reply, ...(together ? { together } : {}) });
const BYE = (name: string) => C('bye', 'bye', '👋', 'Bonne soirée', `${name} : ${quote('Ba beneen yoon')} · « Passe une belle nuit. »`);

// ------------------------------------------------------------------ the people who have a word for you
export const TALKERS: readonly Talker[] = [
  {
    id: 'tonton', name: 'Tonton Ablaye', gender: 'm', age: 60, role: 'patron', unknown: 'Un homme âgé au bar',
    hello: (first, m) => (m === 'dawn'
      ? `Tonton Ablaye : « Tu es encore là ? Moi, je reste jusqu’au bout, comme chaque nuit depuis trente ans. »`
      : first ? `Tonton Ablaye : ${quote('Dalal ak jàmm')} · « Moi, c’est Tonton Ablaye, tout le quartier m’appelle comme ça. Assieds-toi, la nuit est longue. »`
        : `Tonton Ablaye : « Te revoilà, ${say('Sama doom')} ! Ton tabouret est toujours libre. »`),
    choices: [
      C('quartier', 'topic', '🏘️', 'Le quartier avant', '« Avant, ici, on séchait le poisson. Puis Madame Dione a monté le mur et planté sa bougainvillée, et regarde-moi ça. Trente ans que je m’assieds sur le même tabouret. »'),
      C('hotels', 'topic', '🏨', 'Les hôtels d’en face', '« Des touristes qui ne quittent plus leur terrasse ! Ils ne savent pas ce qu’ils ratent. Et le loyer monte, ma foi, le loyer monte. Avant, tout le monde se connaissait de la plage à la route. »'),
      C('patronne', 'topic', '🗝️', 'Madame Dione', '« La patronne ? Une femme de caractère. Elle a commencé avec trois tables et une enceinte. Elle connaît le nom de chaque personne qui travaille ici, et ceux de leurs enfants. Ne dis jamais de mal des gens d’ici devant elle. »'),
      C('assis', 'invite', '🪑', 'Je m’assois un moment', `« ${say('Toogal')} ! Prends un tabouret, prends ce que tu veux. Je ne te dis pas qui est qui dans la salle, c’est plus drôle de le deviner. »`),
      C('non', 'decline', '🙂', 'Pas ce soir, merci', `« ${say('Amul solo')}, ${say('Sama doom')}. La porte est ouverte, ça n’a jamais changé. »`),
      BYE('Tonton Ablaye'),
    ],
  },
  {
    id: 'ibrahima', name: 'Ibrahima', gender: 'm', age: 24, role: 'patron', unknown: 'Un jeune homme au bar',
    hello: (first, m) => (m === 'early' || first
      ? `Ibrahima : « Salut ! ${first ? 'Moi c’est Ibrahima. ' : ''}Tu as suivi le match ? Non ? Tant mieux. J’ai failli jeter mon téléphone dans mon verre. »`
      : `Ibrahima : « Toujours là ? Le match est fini, mais je n’ai pas fini d’en parler ! »`),
    choices: [
      C('match', 'topic', '⚽', 'Le match de ce soir', '« Deux buts sur corner ! Des corners ! Tout le monde regardait le ballon et personne ne marquait son homme. Si j’étais l’entraîneur, ils courraient jusqu’à demain matin. »'),
      C('equipe', 'topic', '🏟️', 'Tu supportes qui ?', '« L’équipe de mon quartier d’abord, les Lions ensuite. Le dimanche, on joue sur le terrain de la Corniche, avec des copains. Viens, il manque toujours quelqu’un. »'),
      C('danse', 'invite', '💃', 'On danse ?', `« Moi ? Je défends mieux que je ne danse ! Mais la piste est là et le DJ est bon. ${say('Waaw kay')}, vas-y, je te regarde d’ici. »`),
      C('non', 'decline', '🙂', 'Pas ce soir, merci', '« Aucun souci ! Je retourne à mon match de rattrapage, on se croise au bar. »'),
      BYE('Ibrahima'),
    ],
  },
  {
    id: 'aminata', name: 'Aminata', gender: 'f', age: 31, role: 'patron', unknown: 'Une femme sur une banquette',
    hello: (first, m) => (first
      ? `Aminata : « Bonsoir ! Moi c’est Aminata. Excuse mon grand sourire : j’ai été nommée cheffe de service aujourd’hui. »`
      : m === 'warm' ? `Aminata : « Encore toi ! La promotion ne me quitte pas, je souris toute seule. »` : `Aminata : « Te revoilà ! Toujours le sourire, ça ne passe pas. »`),
    choices: [
      C('promo', 'topic', '🎉', 'Félicitations !', '« Merci ! Cinq ans à instruire les dossiers des autres, et ce soir c’est mon bureau, mon équipe. Mes collègues sont partis tôt, alors je fête ça avec un jus de bouye. »'),
      C('travail', 'topic', '💼', 'C’est quel travail ?', '« À la banque, au service des crédits pour les petites entreprises. Des tailleurs, des maraîchères, des chauffeurs qui veulent un second véhicule. C’est là que je me sens utile. »'),
      C('assis', 'invite', '🪑', 'Je peux m’asseoir ?', `« Bien sûr, ${say('Toogal')} ! Une promotion, ça se fête mieux avec quelqu’un à côté. »`),
      C('deux', 'flirt', '😏', 'Ça se fête à deux, non ?', '« Ha ! Tu ne perds pas de temps. Je finis la soirée chez des amis à Ngor, tu peux venir avec moi si tu veux. Aucune pression : tu peux dire non, ça ne changera rien. »', true),
      C('non', 'decline', '🙂', 'Non merci, je reste ici ce soir', `« ${say('Amul solo')} ! Reste, profite de la musique. Je ne t’en veux pas du tout, je plaisantais à moitié. »`),
      BYE('Aminata'),
    ],
  },
  {
    id: 'fatou', name: 'Fatou', gender: 'f', age: 27, role: 'patron', unknown: 'Une femme près de la piste',
    hello: (first, m) => (first
      ? `Fatou : « Hé ! Moi c’est Fatou, et c’est mon anniversaire : vingt-huit ans ! Avec les filles, on danse jusqu’à ce qu’il fasse jour. »`
      : m === 'peak' ? `Fatou : « Ça chauffe, non ? ${say('Rafet na')}, la musique ce soir ! »` : `Fatou : « Te revoilà ! Les autres arrivent après leur service, il y aura du monde. »`),
    approach: 'Fatou : « C’est mon anniversaire ! Viens danser avec nous, on ne va pas laisser la piste vide. »',
    choices: [
      C('annif', 'topic', '🎂', 'Joyeux anniversaire !', `« ${say('Jërëjëf')} ! Mes amies m’ont caché leur surprise toute la semaine. Un gâteau au bar à minuit, paraît-il. Je fais semblant de ne rien savoir. »`),
      C('amies', 'topic', '👯', 'Vous êtes nombreuses ?', '« Seynabou est là, les autres arrivent plus tard. On s’est connues au lycée : quinze ans d’amitié et toujours les mêmes disputes sur la musique ! »'),
      C('danse', 'invite', '💃', 'On danse ?', `« ${say('Waaw kay')} ! Va sur la piste, lance une danse, je te rejoins pour les derniers pas. Le DJ nous donne du tempo. »`),
      C('non', 'decline', '🙂', 'Pas maintenant, merci', '« Pas de souci du tout, c’est ta soirée aussi ! Reviens quand tu en as envie, on sera là. »'),
      BYE('Fatou'),
    ],
  },
  {
    id: 'cheikh', name: 'Cheikh', gender: 'm', age: 38, role: 'patron', unknown: 'Un homme sur la terrasse',
    hello: (first) => (first
      ? 'Cheikh : « Excuse-moi… Cheikh. Je prends l’air, je me suis un peu disputé avec ma femme. Rien de grave, rien de grave. »'
      : 'Cheikh : « Encore moi. Je n’ai toujours pas trouvé les bons mots. »'),
    choices: [
      C('dispute', 'topic', '💬', 'Qu’est-ce qui s’est passé ?', '« Des histoires de belle-famille. Elle veut aller chez ses parents pour la fête, j’avais promis aux miens. On a haussé le ton, puis on a ri nerveusement. Le Patio, c’est notre endroit depuis dix ans : on y vient pour se parler, même quand on ne se parle pas. »'),
      C('conseil', 'topic', '🤝', 'Un conseil ?', `« On dit qu’il ne faut jamais se coucher fâché. Je vais lui apporter un jus et lui dire qu’on ira chez ses parents… et chez les miens ensuite. ${say('Ndank ndank')}, ça marche toujours. »`),
      C('non', 'decline', '🙂', 'Je te laisse tranquille', `« Merci de comprendre. ${say('Amul solo')}, bonne soirée à toi. »`),
      BYE('Cheikh'),
    ],
  },
  {
    id: 'marieme', name: 'Marième', gender: 'f', age: 36, role: 'patron', unknown: 'Une femme à une table basse',
    hello: (first) => (first
      ? 'Marième : « Bonsoir. Marième. Je prends un verre au calme, mon mari est dehors à bouder sur la terrasse. Il va revenir, il revient toujours. »'
      : 'Marième : « Tiens, te voilà. Toujours pas de nouvelles de lui. Il fait le tour du patio, je le connais. »'),
    choices: [
      C('couple', 'topic', '💍', 'Vous venez souvent ?', '« Dix ans de mariage, deux enfants, et on se dispute toujours pour la même chose : chez qui on va. On finit par en rire. Le Patio nous a vus nous fiancer, à une table d’ici. »'),
      C('conseil', 'topic', '🥤', 'Un conseil pour la soirée ?', '« Prends un jus de bouye au bar, c’est le meilleur. Et danse : après minuit, la piste est généreuse avec tout le monde. »'),
      C('non', 'decline', '🙂', 'Je ne veux pas déranger', `« Tu ne déranges pas du tout. Mais si tu préfères me laisser tranquille, ${say('amul solo')}, aucun problème. Bonne soirée ! »`),
      BYE('Marième'),
    ],
  },
  {
    id: 'rokhaya', name: 'Rokhaya', gender: 'f', age: 33, role: 'worker', unknown: 'Une femme près de la piste',
    hello: (first, m) => (first
      ? 'Rokhaya : « Bonsoir. Moi c’est Rokhaya. Je travaille ici la nuit, tout le monde sait ce que je fais : je ne m’en cache pas. Si ce n’est pas ce que tu cherches, aucun problème, on peut juste parler. »'
      : m === 'dawn' ? 'Rokhaya : « Encore debout ? La fin de nuit, c’est mon moment préféré : on parle vrai. »'
        : 'Rokhaya : « Te revoilà. Assieds-toi si tu veux, ou va danser, c’est comme tu préfères. »'),
    approach: 'Rokhaya : « Bonsoir ! Il y a de la place à côté de moi si tu veux discuter un moment. Aucune obligation. »',
    choices: [
      C('metier', 'topic', '🌙', 'Ton travail de nuit', '« C’est un travail comme un autre : des horaires, de la fatigue, des jours faciles et des jours durs. Je l’ai choisi pour payer l’école de mes deux enfants. Le jour je suis maman, la nuit je suis ici. Je n’ai pas honte, même si les gens aiment juger. »'),
      C('enfants', 'topic', '👧', 'Tes enfants', '« Ma fille est première de sa classe et veut devenir médecin, mon garçon ne pense qu’au foot. Ils croient que je travaille dans un restaurant. Quand ils seront grands, je leur dirai la vérité, avec respect. En attendant, je continue pour eux. »'),
      C('police', 'topic', '🚓', 'Et la police ?', '« Ça dépend des nuits et des agents. Il y a des contrôles, surtout quand quelqu’un veut se montrer. On garde nos papiers sur nous, on reste groupées et on se prévient. Madame Dione connaît un avocat qui nous a aidées une fois. C’est tout ce que je dirai là-dessus. »'),
      C('patronne', 'topic', '🗝️', 'Madame Dione', '« La patronne ? Dure mais correcte. Elle ne veut pas d’histoires : si quelqu’un insiste ou lève la main, Boubacar le met dehors, sans discussion. Le Patio est un des rares endroits où je me sens à l’abri. »'),
      C('securite', 'topic', '🛡️', 'Comment tu restes en sécurité ?', '« On ne part jamais seule avec quelqu’un qu’on ne connaît pas, on garde les numéros des copines et on prévient quelqu’un de ce qu’on fait. Et surtout : on a le droit de dire non, à n’importe qui, à n’importe quel moment. Toi aussi d’ailleurs. »'),
      C('assis', 'invite', '🪑', 'On s’assoit un moment ?', `« Volontiers, ${say('toogal')}. Parle-moi de toi, ou de rien : j’aime bien les gens qui ne sont pas pressés. »`),
      C('non', 'decline', '🙂', 'Ce n’est pas ce que je cherche, merci', '« Aucun problème, vraiment. Je ne force personne et personne ne me force. On peut parler d’autre chose, ou tu peux profiter de la soirée, c’est très bien aussi. »'),
      BYE('Rokhaya'),
    ],
  },
  {
    id: 'ousseynou', name: 'Ousseynou', gender: 'm', age: 41, role: 'worker', unknown: 'Un homme à une table haute',
    hello: (first, m) => (first
      ? 'Ousseynou : « Salut. Ousseynou. Je travaille ici la nuit, ça se sait. Si tu viens pour discuter, je suis là. Sinon, la soirée est à toi, sans rancune. »'
      : m === 'dawn' ? `Ousseynou : « La nuit se termine, ${say('Sama xarit')}. Il y a toujours un moment où le bruit tombe. »`
        : 'Ousseynou : « Te revoilà. Content de te revoir, sincèrement. »'),
    choices: [
      C('metier', 'topic', '🌙', 'Ton travail ici', '« Je tiens compagnie, je danse, je parle. Le plus dur, ce n’est pas le travail : c’est le regard des gens et le silence à la maison. Ma famille croit que je fais la sécurité dans un hôtel. Dix ans que ça dure. »'),
      C('jour', 'topic', '☀️', 'Et le jour ?', '« Le jour je dors, je cuisine, je donne un coup de main à ma sœur au marché. Le soir je mets une chemise propre et je viens ici. Chacun sa routine. »'),
      C('securite', 'topic', '🛡️', 'Entre collègues ?', '« On s’épaule. Un mot, un regard à Boubacar, et c’est réglé. Et quand quelqu’un dit non, c’est fini : personne n’insiste, ni dans un sens ni dans l’autre. Point final. »'),
      C('non', 'decline', '🙂', 'Ce n’est pas ce que je cherche, merci', '« Pas de problème, je ne suis pas vexé. Ça arrive tout le temps et c’est très bien comme ça. Profite bien de la soirée, sincèrement. »'),
      BYE('Ousseynou'),
    ],
  },
];
export const talker = (id: string) => TALKERS.find(t => t.id === id);

// ------------------------------------------------------------------ the doorman (Boubacar)
export interface PatioCtx { night: number; hour: number; nights: number }
export const theme = (night: number) => clubTheme(night, PATIO_THEMES);
const when = (k: number) => (k === 0 ? 'Ce soir' : k === 1 ? 'Demain' : `Dans ${k} nuits`);
/** The week from tonight: « Ce soir · Afro-lounge », « Demain · Soirée live »… */
export const programme = (night: number, n = 7) => Array.from({ length: n }, (_, k) => `${when(k)} · ${theme(night + k).label}`);
export const PATIO_BYE = `« ${PATIO_NAME} te dit ${say('Ba beneen yoon')}. Rentre bien. »`;

export function doormanGreeting(c: PatioCtx): string {
  const t = theme(c.night).label;
  if (c.nights >= PATIO_REGULAR) return `Boubacar : « Ah, te revoilà ! Pour toi, l’entrée est offerte. Ce soir : ${t}. Entre, entre. »`;
  if (c.nights > 0) return `Boubacar : « Bonsoir ! Ce soir, c’est ${t}. L’entrée, c’est ${price(PATIO_ENTRY)}, comme d’habitude. »`;
  return `Boubacar : « Bonsoir et bienvenue au Patio. 18 ans minimum, pièce d’identité si on te la demande. Ce soir : ${t}. L’entrée, c’est ${price(PATIO_ENTRY)}, une seule fois pour la nuit. »`;
}
/** At the door, before anything is paid: the fee, once for the night, the age. */
export const doormanAsk = (c: PatioCtx) =>
  `Boubacar : « Bonsoir. 18 ans minimum, pièce d’identité si on te la demande. Ce soir, c’est ${theme(c.night).label}. L’entrée, c’est ${price(PATIO_ENTRY)}, une seule fois pour toute la nuit : tu peux sortir fumer et revenir. »`;
export const doormanRules = () =>
  '« La règle de la maison est simple : un non, c’est un non. Personne ne force personne, ni au bar, ni sur la piste, ni ailleurs. Si quelqu’un insiste, tu me fais signe et je m’en occupe. Pour tout le monde, du patron à la serveuse. »';
export const doormanHours = () => `« Le Patio ouvre de ${PATIO_HOURS[0]} h à ${PATIO_HOURS[1]} h, tous les soirs. Avant ${PATIO_HOURS[0]} h, c’est la livraison et le ménage : la porte reste fermée. »`;
export function doormanRegulars(c: PatioCtx): string {
  if (c.nights >= PATIO_REGULAR) return '« Tu es un habitué : tu entres sans payer. Madame Dione tient à ses habitués. »';
  const left = PATIO_REGULAR - c.nights;
  return `« Les habitués entrent sans payer. Encore ${left} soirée${left > 1 ? 's' : ''} ici et je te reconnaîtrai à la porte. »`;
}
export function doormanWelcome(c: PatioCtx): string {
  if (c.nights === PATIO_REGULAR) return 'Boubacar : « À partir de maintenant, l’entrée est pour moi. Bienvenue chez toi. »';
  if (c.nights > PATIO_REGULAR) return `Boubacar : ${quote('Dalal ak jàmm')} · « Entre, entre ! »`;
  return 'Boubacar : « Bonne soirée. Si quelque chose te dérange, viens me le dire, d’accord ? »';
}
export const doormanBye = () => `Boubacar : ${quote('Ñibbil ak jàmm')} · « Reviens quand tu veux. »`;
export const DOOR_BYE = `Boubacar : ${PATIO_BYE}`;

// ------------------------------------------------------------------ the barwoman (Coumba)
export const barmanGreeting = (nights: number) => (nights > 2
  ? `Coumba : « Content de te revoir ! Comme d’habitude ? Je te prépare ça. »`
  : `Coumba : « Bonsoir ! Je suis Coumba, c’est moi qui tiens le bar. Il y a de tout, avec ou sans alcool. Prends ton temps. »`);
const fmt = (d: { label: string; price: number }) => `${d.label.toLowerCase()} ${price(d.price)}`;
export const barmanMenu = () => `« Avec alcool : ${PATIO_DRINKS.filter(d => d.alcohol).map(fmt).join(', ')}. Sans alcool : ${PATIO_DRINKS.filter(d => !d.alcohol).map(fmt).join(', ')}. On paie au comptoir, chacun son verre. »`;
export const barmanSoft = () => `« Aucune obligation de boire de l’alcool ici : le jus de bouye et le Virgin Sunset ont autant de succès que les cocktails. Et l’eau est toujours là si tu veux souffler. »`;
export const barmanHouse = () => '« Le Dakar Sunset, c’est la maison : rhum, mangue, bissap. Madame Dione l’a inventé il y a vingt ans, je n’ai pas le droit de changer la recette. »';
export const barmanBye = () => `Coumba : ${quote('Jërëjëf')} · « À tout à l’heure. »`;

// ------------------------------------------------------------------ the DJ (DJ Sidy)
export function djTalk(c: PatioCtx): string {
  const t = theme(c.night);
  return `DJ Sidy : « Ce soir : ${t.label}. ${t.detail}. ${say('Nanu dem')} ! »`;
}
export const djRequest = () => '« Un morceau ? Dis-moi, je le passe dès que le précédent se termine. Ça te coûte 500 F, c’est le tarif du DJ, et la piste applaudit. »';
export const djBye = () => `DJ Sidy : ${quote('Ba beneen yoon')} !`;
/** The DJ's drops, one line per drop of the night. */
export function djDrop(k: number): string {
  const lines = [
    'DJ Sidy : « Les mains en l’air ! » · toute la piste lève les bras',
    `DJ Sidy : « Le Patio, vous êtes là ? » · la piste répond ${quote('Waaw kay')}`,
    'DJ Sidy : « Attention… le son arrive ! » · la piste saute avec la basse',
    'DJ Sidy : « Plus fort, tout le monde ! » · les bras se lèvent, la cour chante',
  ];
  return lines[((k % lines.length) + lines.length) % lines.length];
}
export const djSongFor = () => `DJ Sidy : ${quote('Waaw kay')} · « Celui-là, c’est pour toi ! »`;
/** A guest's tonight line used by the DJ's « Les prochaines soirées ». */
export const nextNights = (night: number) => `« ${programme(night + 1, 6).join(' · ')}. »`;

// ------------------------------------------------------------------ the signs and the street
export const SIGNS = {
  main: 'LE PATIO', sub: 'BAR · CLUB · 18+', hours: `OUVERT ${PATIO_HOURS[0]} H – ${PATIO_HOURS[1]} H · TOUS LES SOIRS`,
  closed: `FERMÉ · OUVRE À ${PATIO_HOURS[0]} H`, open: 'OUVERT', smoke: 'FUMEURS', smokeSub: 'terrasse · entrée de la rue', vip: 'VIP · RÉSERVÉ', bar: 'BAR · COCKTAILS', age: 'ENTRÉE 18 ANS ET PLUS',
} as const;
/** The place's identity in the neighbourhood (« Les coins du quartier », the walking hint), in front of the gate. */
export const PLACE_DESCRIPTION = `Boubacar, le videur : « Bonsoir ! » Bar et club ouvert de ${PATIO_HOURS[0]} h à ${PATIO_HOURS[1]} h · 18 ans minimum · l’entrée est de ${price(PATIO_ENTRY)}.`;

// ------------------------------------------------------------------ for the tests: every string the file can say
export function allStrings(): string[] {
  const out: string[] = [];
  const m: Moment[] = ['early', 'warm', 'peak', 'dawn'];
  for (const t of TALKERS) {
    out.push(t.name, t.unknown, ...(t.approach ? [t.approach] : []));
    for (const first of [true, false]) for (const x of m) out.push(t.hello(first, x));
    for (const c of t.choices) out.push(c.label, c.reply);
  }
  for (const night of [0, 1, 2, 3, 4, 5, 6]) for (const nights of [0, 1, PATIO_REGULAR - 1, PATIO_REGULAR, PATIO_REGULAR + 2]) {
    const c: PatioCtx = { night, hour: 23, nights };
    out.push(doormanGreeting(c), doormanAsk(c), doormanRegulars(c), doormanWelcome(c), djTalk(c), ...programme(night), nextNights(night));
  }
  for (const n of [0, 1, 3]) out.push(barmanGreeting(n));
  for (let k = 0; k < 4; k++) out.push(djDrop(k));
  out.push(doormanRules(), doormanHours(), doormanBye(), DOOR_BYE, barmanMenu(), barmanSoft(), barmanHouse(), barmanBye(), djRequest(), djBye(), djSongFor(), PLACE_DESCRIPTION, PATIO_BYE, ...Object.values(SIGNS));
  for (const t of PATIO_THEMES) out.push(t.label, t.detail);
  for (const d of PATIO_DRINKS) out.push(d.label, d.detail ?? '');
  return out.filter(s => s.length > 0);
}
