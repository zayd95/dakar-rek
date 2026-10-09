import type { Needs } from '../core/types';
import type { GameState } from '../core/state';
import { Relations, PLAYER } from './relations';
import { castById } from './cast';
import { economyStep, type Step } from '../economy/progress';
import { furnitureCount } from '../economy/furniture';

/**
 * Authored story beats — short branching interactions (2–4 choices) triggered by place and relationship state.
 * PROVISIONAL DRAFT text in French (Habib to review). No generative dialogue.
 */
export interface Effects {
  rel?: [string, string, number][];     // [a, b, delta]; use 'player' for the player
  flags?: string[];
  money?: number;
  needs?: Partial<Needs>;
  counter?: string;
  scene?: 'celebration';
}
export interface Choice { id: string; label: string; reply: string; effects: Effects; completes?: boolean }
export interface Beat {
  id: string; npc: string; title: string; text: string;
  when: (r: Relations, s: GameState) => boolean;
  choices: Choice[];
  /** One line shown in the journal when this beat is the suggested next step. */
  hint: string;
  /** Draft text still to review (all beats are drafts; set on the newer ones explicitly). */
  draft?: boolean;
}

const P = PLAYER;

export const BEATS: Beat[] = [
  {
    id: 'ibou_welcome', npc: 'ibou', title: 'Bienvenue au quartier', hint: 'Parle à Tonton Ibou, devant ta chambre (Pikine).',
    text: 'Ah, te voilà installé ! Le quartier est petit, tout le monde se connaît. Tu cherches du travail ?',
    when: () => true,
    choices: [
      { id: 'oui', label: 'Oui, n’importe quoi d’honnête', reply: 'Va voir Modou au garage. Dis-lui que c’est Ibou qui t’envoie. Et Mame Diarra, à sa gargote, cherche quelqu’un pour livrer ses plats en Tiak Tiak.', effects: { rel: [[P, 'ibou', 8]], flags: ['reco_modou'], needs: { social: 8 } } },
      { id: 'installer', label: 'D’abord je m’installe', reply: 'Prends ton temps. Quand tu seras prêt, Modou au garage cherche de l’aide, et Mame Diarra a des livraisons Tiak Tiak à faire.', effects: { rel: [[P, 'ibou', 4]], flags: ['reco_modou'], needs: { social: 6 } } },
    ],
  },
  // Lot B « Première ascension » (DRAFT text, to review): Ibou reacts to the first delivery, then to the first furniture,
  // and each time suggests the next goal (an 'objectif:<item>' flag read by src/economy/progress.ts).
  {
    id: 'ibou_tiak', npc: 'ibou', title: 'Le Tiak Tiak', hint: 'Tonton Ibou a entendu parler de ta première livraison : va le voir (Pikine).', draft: true,
    text: 'On m’a dit que tu as fait ta première livraison ! Le Tiak Tiak, c’est du travail honnête : on gagne sa journée et on connaît vite tout le quartier. Qu’est-ce que tu vas faire de cet argent ?',
    when: (_r, s) => (s.data.counters.livraisons ?? 0) >= 1,
    choices: [
      { id: 'radio', label: 'Meubler ma chambre, une radio d’abord', reply: 'Bonne idée, une radio tient compagnie le soir. La quincaillerie, à côté de la Maïga du marché, vend des meubles.', effects: { rel: [[P, 'ibou', 5]], flags: ['objectif:radio'], needs: { moral: 4 } } },
      { id: 'matelas', label: 'Un vrai matelas', reply: 'Ton dos te remerciera ! Garde de l’argent de côté : la quincaillerie près de la Maïga en vend.', effects: { rel: [[P, 'ibou', 5]], flags: ['objectif:matelas'], needs: { moral: 4 } } },
      { id: 'epargner', label: 'Garder de côté', reply: 'C’est sage. Mais un miroir ne coûte pas cher, et il faut être présentable devant les clients.', effects: { rel: [[P, 'ibou', 4]], flags: ['objectif:miroir'], needs: { moral: 2 } } },
    ],
  },
  {
    id: 'ibou_meuble', npc: 'ibou', title: 'La chambre prend forme', hint: 'Tonton Ibou a vu ton premier meuble : va lui parler (Pikine).', draft: true,
    text: 'Je suis passé devant ta porte : ta chambre commence à ressembler à une vraie maison ! Et maintenant, tu vises quoi ?',
    when: (_r, s) => furnitureCount(s) >= 1,
    choices: [
      { id: 'chaises', label: 'Des chaises, pour recevoir', reply: 'Comme ça je viendrai prendre le thé chez toi ! Deux chaises en plastique, ce n’est pas cher.', effects: { rel: [[P, 'ibou', 6]], flags: ['objectif:chaises'], needs: { social: 6 } } },
      { id: 'tele', label: 'Une petite télé', reply: 'Pour regarder la lutte ? Il faudra beaucoup de livraisons. Courage, garde de l’argent pour ça.', effects: { rel: [[P, 'ibou', 4]], flags: ['objectif:tele'], needs: { social: 4 } } },
      { id: 'matelas', label: 'Un bon matelas', reply: 'Bien dormir, c’est bien travailler. Mets un peu de côté après chaque livraison.', effects: { rel: [[P, 'ibou', 4]], flags: ['objectif:matelas'], needs: { social: 4 } } },
    ],
  },
  {
    id: 'modou_reco', npc: 'modou', title: 'Recommandé par Ibou', hint: 'Ibou t’a recommandé : va voir Modou au garage (Pikine).',
    text: 'Ibou t’envoie ? Si Ibou te fait confiance, moi aussi. Le travail est dur mais je paie bien ceux qui sont sérieux.',
    when: r => r.has('reco_modou'),
    choices: [
      { id: 'commencer', label: 'Je peux commencer quand vous voulez', reply: 'Bien. Passe au garage : tu toucheras le tarif des gens de confiance.', effects: { rel: [[P, 'modou', 12], [P, 'ibou', 4], ['ibou', 'modou', 2]], flags: ['modou_trust'] } },
      { id: 'plus_tard', label: 'Merci, je repasserai', reply: 'La porte est ouverte.', effects: { rel: [[P, 'modou', 3]] }, completes: false },
    ],
  },
  {
    id: 'mame_gaz', npc: 'mame', title: 'Un coup de main', hint: 'Mame Diarra, à sa gargote (Pikine), a besoin d’aide.',
    text: 'Ma bonbonne de gaz est vide et le service commence bientôt. Tu peux m’aider à porter la nouvelle ?',
    when: (_r, s) => (s.data.counters.actions ?? 0) >= 1,
    choices: [
      { id: 'aider', label: 'Bien sûr, j’arrive', reply: 'Que Dieu te le rende ! Ici, tu manges désormais à prix d’ami.', effects: { rel: [[P, 'mame', 14]], flags: ['mame_helped'], needs: { energie: -8, moral: 6 } } },
      { id: 'refuser', label: 'Désolé, pas le temps', reply: 'Bon… une autre fois peut-être.', effects: { rel: [[P, 'mame', -3]] }, completes: false },
    ],
  },
  {
    id: 'moussa_coach', npc: 'moussa', title: 'Un ami à Pikine', hint: 'Entraîne-toi sur la Corniche, puis parle à Moussa.',
    text: 'Tu cours bien, tu as du souffle. Tu connais Coach Ablaye, à l’écurie Baobab de Pikine ? C’est un ami. Dis-lui que je t’envoie.',
    when: (_r, s) => (s.data.counters.forme ?? 0) >= 1,
    choices: [
      { id: 'merci', label: 'J’irai le voir, merci', reply: 'Il est exigeant, mais juste.', effects: { rel: [[P, 'moussa', 8], ['moussa', 'ablaye', 2]], flags: ['reco_ablaye'] } },
      { id: 'lutte', label: 'La lutte, ce n’est pas pour moi', reply: 'Comme tu veux. La Corniche t’attend tous les matins.', effects: { rel: [[P, 'moussa', 4]] } },
    ],
  },
  {
    id: 'ablaye_join', npc: 'ablaye', title: 'L’écurie Baobab', hint: 'Coach Ablaye, à l’écurie de Pikine, cherche des jeunes.',
    text: 'Tu as le gabarit. Ici on s’entraîne dur, on respecte les anciens et on reste humble. Tu veux t’entraîner avec l’écurie Baobab ?',
    when: () => true,
    choices: [
      { id: 'rejoindre', label: 'Je veux apprendre', reply: 'Alors à demain matin, sur le sable. Tu as maintenant accès à l’entraînement de l’écurie.', effects: { rel: [[P, 'ablaye', 10], [P, 'babacar', 5]], flags: ['ecurie_baobab'] } },
      { id: 'regarder', label: 'Je regarde d’abord', reply: 'Regarde, alors. Reviens quand tu seras décidé.', effects: { rel: [[P, 'ablaye', 2]] }, completes: false },
    ],
  },
  {
    id: 'ablaye_rival', npc: 'ablaye', title: 'Un rival', hint: 'Entraîne-toi deux fois à l’écurie : Coach Ablaye veut te présenter quelqu’un.',
    text: 'Lamine, de l’écurie Teranga, raconte partout qu’aucun jeune de Baobab ne lui résiste. Il traîne près de l’arène. Je vais te le présenter.',
    when: (r, s) => r.has('ecurie_baobab') && (s.data.counters.lutte ?? 0) >= 2,
    choices: [
      { id: 'pret', label: 'Je suis prêt', reply: 'Garde la tête froide. On répond dans l’arène, pas avec la bouche.', effects: { rel: [[P, 'ablaye', 5]], flags: ['meet_lamine'] } },
      { id: 'eviter', label: 'Je préfère éviter les histoires', reply: 'Les histoires viennent toutes seules. Va au moins le saluer.', effects: { rel: [[P, 'ablaye', -2]], flags: ['meet_lamine'] } },
    ],
  },
  {
    id: 'lamine_meet', npc: 'lamine', title: 'Face à Lamine', hint: 'Va saluer Lamine, près de l’arène (Pikine).',
    text: 'Alors c’est toi, le nouveau de Baobab ? Ablaye ramasse n’importe qui maintenant.',
    when: r => r.has('meet_lamine'),
    choices: [
      { id: 'respect', label: '« Respect. On se verra dans l’arène. »', reply: 'Hm. Au moins tu es poli. On verra ce que tu vaux.', effects: { rel: [[P, 'lamine', 6], [P, 'ablaye', 4]], flags: ['rival_lamine'] } },
      { id: 'provoquer', label: '« Tu parles beaucoup pour un lutteur. »', reply: 'Ha ! Tout Pikine saura que tu as dit ça.', effects: { rel: [[P, 'lamine', -18], [P, 'babacar', 4]], flags: ['rival_lamine'] } },
      { id: 'ignorer', label: 'Partir sans répondre', reply: 'Lamine rit avec ses amis derrière toi.', effects: { rel: [[P, 'lamine', -4]], flags: ['rival_lamine'] } },
    ],
  },
  {
    id: 'babacar_win', npc: 'babacar', title: 'L’écurie fête Babacar', hint: 'Babacar a gagné son combat : l’écurie Baobab fait la fête (Pikine).',
    text: 'J’ai gagné hier ! Toute l’écurie est là, les tambours aussi. Tu viens fêter avec nous ?',
    when: r => r.has('ecurie_baobab') && r.has('rival_lamine'),
    choices: [
      { id: 'danser', label: 'Je danse avec l’écurie', reply: 'Voilà l’esprit de Baobab !', effects: { rel: [[P, 'babacar', 10], [P, 'ablaye', 4]], needs: { social: 20, moral: 12, energie: -6 }, scene: 'celebration', flags: ['fete_baobab'] } },
      { id: 'feliciter', label: 'Féliciter Babacar', reply: 'Merci, mon frère. La prochaine fois, c’est ton tour.', effects: { rel: [[P, 'babacar', 6]], needs: { social: 8 } } },
    ],
  },
  {
    id: 'adja_stall', npc: 'adja', title: 'Tenir l’étal', hint: 'Adja, au marché Sandaga (Plateau), a besoin de quelqu’un.',
    text: 'Mon vendeur est malade aujourd’hui. Tu peux tenir l’étal une heure ? Je te paie, bien sûr.',
    when: () => true,
    choices: [
      { id: 'accepter', label: 'D’accord (+3 000 F)', reply: 'Tu as bien vendu ! Je parlerai de toi à Fatou.', effects: { rel: [[P, 'adja', 12]], money: 3000, needs: { energie: -18, faim: -6 }, flags: ['adja_trust'], counter: 'shifts' } },
      { id: 'refuser', label: 'Une autre fois', reply: 'Pas de souci, reviens quand tu veux.', effects: {}, completes: false },
    ],
  },
  {
    id: 'fatou_friend', npc: 'fatou', title: 'La nouvelle circule', hint: 'Adja a parlé de toi à Fatou (gargote, Plateau).',
    text: 'Adja m’a dit que tu l’as bien aidée au marché. Les amis d’Adja mangent à prix d’ami chez moi.',
    when: r => r.has('adja_trust'),
    choices: [
      { id: 'merci', label: 'Merci, Fatou', reply: 'Assieds-toi, le ceebu jën est prêt.', effects: { rel: [[P, 'fatou', 12], ['adja', 'fatou', 2]], flags: ['fatou_friend'] } },
    ],
  },
  {
    id: 'aida_revise', npc: 'aida', title: 'Réviser ensemble', hint: 'Aïda, au café Touba de Fann, prépare ses examens.',
    text: 'On révise en groupe ce soir à la bibliothèque de l’UCAD. Tu veux venir ? Il y a toujours du café.',
    when: () => true,
    choices: [
      { id: 'venir', label: 'Je viens', reply: 'Super, on se retrouve ici après le cours.', effects: { rel: [[P, 'aida', 10]], needs: { social: 12, energie: -6 }, counter: 'etudes', flags: ['aida_friend'] } },
      { id: 'non', label: 'Pas ce soir', reply: 'Une autre fois !', effects: { rel: [[P, 'aida', 1]] }, completes: false },
    ],
  },
  {
    id: 'ousmane_cousin', npc: 'ousmane', title: 'Le cousin d’Ibou', hint: 'Ousmane, au port de Ngor, connaît Tonton Ibou.',
    text: 'Tu viens de Pikine ? Tu connais Ibou ? C’est mon cousin ! S’il te connaît, tu peux monter sur la pirogue du matin.',
    when: r => r.level(PLAYER, 'ibou') >= 8,
    choices: [
      { id: 'oui', label: 'Ibou est mon voisin', reply: 'Alors bienvenue sur le quai. Les gens de confiance sont mieux payés.', effects: { rel: [[P, 'ousmane', 12], [P, 'ibou', 3]], flags: ['ousmane_trust'] } },
    ],
  },
  {
    id: 'khady_service', npc: 'khady', title: 'Un service du soir', hint: 'Ousmane a parlé de toi à Khady, au restaurant Le Pointe.',
    text: 'Ousmane dit que tu es sérieux. Un serveur m’a lâchée ce soir. Tu peux faire le service ?',
    when: r => r.has('ousmane_trust'),
    choices: [
      { id: 'oui', label: 'Oui (+4 000 F)', reply: 'Merci ! Les clients t’ont trouvé très poli.', effects: { rel: [[P, 'khady', 12], ['ousmane', 'khady', 2]], money: 4000, needs: { energie: -20 }, flags: ['khady_trust'], counter: 'shifts' } },
      { id: 'non', label: 'Je ne peux pas ce soir', reply: 'Dommage. Reviens si tu veux du travail.', effects: {}, completes: false },
    ],
  },
  // ---- NPC life lane (8 Oct 2026): the Diallo family and Ndeye. BROUILLON — à relire par Habib. French only;
  // no Wolof/Pulaar beyond what the repo already has.
  {
    id: 'mamadou_livraison', npc: 'mamadou', title: 'Le riz de Mame Diarra', hint: 'Mamadou Diallo, à la Boutique Diallo (Pikine), cherche quelqu’un pour une livraison.',
    text: 'On m’a dit que tu cherches à te rendre utile. Trois sacs de riz attendent Mame Diarra à sa gargote, et Thierno ne peut pas quitter le comptoir. Tu t’en charges ?',
    when: r => r.has('info_livraison') || r.has('intro_mamadou'),
    choices: [
      { id: 'livrer', label: 'Je livre les sacs (+1 500 F)', reply: 'Mame a fait dire que tout est arrivé. J’écris ton nom dans mon carnet — du bon côté, celui des gens fiables.', effects: { rel: [[P, 'mamadou', 12], [P, 'mame', 4], ['mamadou', 'mame', 3]], money: 1500, needs: { energie: -14, faim: -4 }, flags: ['mamadou_trust'], counter: 'shifts' } },
      { id: 'credit', label: '« Et si tu me faisais crédit en échange ? »', reply: 'Ha ! Mon carnet de crédit est déjà plus épais que l’annuaire. Rends d’abord le service, on parlera après.', effects: { rel: [[P, 'mamadou', 2]] }, completes: false },
      { id: 'non', label: 'Pas aujourd’hui', reply: 'Le riz attendra. Pas trop longtemps, j’espère : Mame n’est pas patiente.', effects: {}, completes: false },
    ],
  },
  {
    id: 'kadiatou_enquete', npc: 'kadiatou', title: 'L’enquête de Kadiatou', hint: 'Kadiatou Diallo, place des étudiants à Fann, cherche des témoins pour son mémoire.',
    text: 'Tonton Mamadou t’envoie ? Il t’a sûrement dit que je pose trop de questions. Mon mémoire porte sur le crédit dans les boutiques de quartier. Cinq questions… peut-être six ?',
    when: r => r.has('intro_kadiatou'),
    choices: [
      { id: 'repondre', label: 'Je réponds à tout', reply: 'Merci ! Tu es mon dixième témoin. Mon directeur de mémoire sera content, pour une fois.', effects: { rel: [[P, 'kadiatou', 10], ['kadiatou', 'mamadou', 1]], needs: { social: 8, energie: -4 }, counter: 'etudes', flags: ['kadiatou_friend'] } },
      { id: 'carnet', label: '« Ton oncle note même les bonbons dans son carnet, non ? »', reply: 'Même les bonbons ! C’est pour ça qu’il est mon premier cas d’étude. Surtout, ne lui dis pas.', effects: { rel: [[P, 'kadiatou', 6]], needs: { social: 6, moral: 4 }, flags: ['kadiatou_friend', 'kadiatou_carnet'] } },
      { id: 'plus_tard', label: 'Une autre fois', reply: 'Je suis là tous les après-midi, sur le banc. Avec mes fiches.', effects: {}, completes: false },
    ],
  },
  {
    id: 'kadiatou_ndeye', npc: 'kadiatou', title: 'Une commerçante de la Médina', hint: 'Kadiatou voudrait interroger une commerçante de la Médina : tu connais Ndeye.',
    text: 'Il me manque une commerçante de la Médina pour mon enquête. Tu connais quelqu’un qui accepterait de me parler ?',
    when: (r, s) => r.has('kadiatou_friend') && (r.level(PLAYER, 'ndeye') >= 10 || s.data.flags.includes('regular_ndeye')),
    choices: [
      { id: 'presenter', label: 'Je te présente Ndeye, à l’atelier', reply: 'Ndeye a parlé deux heures ! J’ai de quoi écrire un chapitre entier. Elle te salue.', effects: { rel: [[P, 'kadiatou', 6], [P, 'ndeye', 4], ['kadiatou', 'ndeye', 20]], flags: ['kadiatou_ndeye'] } },
      { id: 'non', label: 'Je ne connais personne', reply: 'Tant pis, je trouverai bien.', effects: {}, completes: false },
    ],
  },
  {
    id: 'ndeye_commande', npc: 'ndeye', title: 'La commande de la fête', hint: 'Ndeye, à l’Atelier Ndeye (Médina), est débordée avant une fête.',
    text: 'Trois boubous à finir pour un baptême samedi, et Ousseynou est parti livrer. Il me manque du fil, et le repassage n’attend pas. Tu as un moment ?',
    when: () => true,
    choices: [
      { id: 'sandaga', label: 'Je vais chercher le fil chez Adja, à Sandaga', reply: 'Adja t’a fait le bon prix ? Elle ne le fait qu’aux gens qu’elle apprécie. Les boubous seront prêts.', effects: { rel: [[P, 'ndeye', 10], [P, 'adja', 4], ['ndeye', 'adja', 3]], needs: { energie: -10 }, flags: ['ndeye_trust'] } },
      { id: 'repasser', label: 'Je reste repasser (+1 200 F)', reply: 'Pas un pli. Tu as déjà fait ça, avoue.', effects: { rel: [[P, 'ndeye', 8]], money: 1200, needs: { energie: -12, hygiene: -4 }, flags: ['ndeye_trust'], counter: 'shifts' } },
      { id: 'non', label: 'Pas maintenant', reply: 'Bon. Si tu repasses, l’atelier est ouvert jusqu’au soir.', effects: {}, completes: false },
    ],
  },
];

export function availableBeat(npc: string, r: Relations, s: GameState): Beat | null {
  return BEATS.find(b => b.npc === npc && !r.beatDone(b.id) && b.when(r, s)) ?? null;
}

/**
 * The one suggested next step (at most one at a time; nothing is compulsory).
 * Order: Ibou's welcome, then Ibou's reactions to the first delivery / furniture, then the economic step
 * (src/economy/progress.ts), then the other beats.
 */
export function suggestion(r: Relations, s: GameState): Beat | Step | null {
  const open = (b: Beat) => !r.beatDone(b.id) && b.when(r, s);
  const welcome = BEATS[0];
  if (open(welcome)) return welcome;
  const ibou = BEATS.find(b => (b.id === 'ibou_tiak' || b.id === 'ibou_meuble') && open(b));
  if (ibou) return ibou;
  return economyStep(s) ?? BEATS.find(open) ?? null;
}

export function applyChoice(beat: Beat, choice: Choice, r: Relations, s: GameState): string[] {
  const notes = applyEffects(choice.effects, r, s, beat.title);
  if (choice.completes !== false) s.data.beats[beat.id] = choice.id;
  return notes;
}

/** Apply effects (shared by story beats and replayable situations); returns the relationship notes for a toast.
 * `label` names any money movement in the wallet history (the beat or situation title). */
export function applyEffects(e: Effects, r: Relations, s: GameState, label: string): string[] {
  const notes: string[] = [];
  for (const [a, b, d] of e.rel ?? []) {
    r.change(a, b, d);
    if (a === PLAYER || b === PLAYER) {
      const who = castById(a === PLAYER ? b : a);
      if (who && d !== 0) notes.push(`${who.name} ${d > 0 ? '▲' : '▼'}`);
    }
  }
  for (const f of e.flags ?? []) r.set(f);
  if (e.money) s.addMoney(e.money, label);
  if (e.needs) s.adjust(e.needs);
  if (e.counter) s.count(e.counter);
  return notes;
}
