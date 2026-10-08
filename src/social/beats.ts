import type { Needs } from '../core/types';
import type { GameState } from '../core/state';
import { Relations, PLAYER } from './relations';
import { castById } from './cast';

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
}

const P = PLAYER;

export const BEATS: Beat[] = [
  {
    id: 'ibou_welcome', npc: 'ibou', title: 'Bienvenue au quartier', hint: 'Parle à Tonton Ibou, devant ta chambre (Pikine).',
    text: 'Ah, te voilà installé ! Le quartier est petit, tout le monde se connaît. Tu cherches du travail ?',
    when: () => true,
    choices: [
      { id: 'oui', label: 'Oui, n’importe quoi d’honnête', reply: 'Va voir Modou au garage. Dis-lui que c’est Ibou qui t’envoie.', effects: { rel: [[P, 'ibou', 8]], flags: ['reco_modou'], needs: { social: 8 } } },
      { id: 'installer', label: 'D’abord je m’installe', reply: 'Prends ton temps. Quand tu seras prêt, Modou au garage cherche de l’aide.', effects: { rel: [[P, 'ibou', 4]], flags: ['reco_modou'], needs: { social: 6 } } },
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
    text: 'Je prépare mes examens. On peut réviser un moment ici, au café. Tu veux te joindre à moi ?',
    when: r => !r.has('aida_friend'),
    choices: [
      { id: 'venir', label: 'Je viens', reply: 'Super ! Ferme cette fenêtre, puis choisis « Réviser avec Aïda » dans mon menu pour commencer.', effects: { flags: ['aida_revision_invited'] } },
      { id: 'non', label: 'Une autre fois', reply: 'Une autre fois !', effects: {}, completes: false },
    ],
  },
  {
    id: 'aida_revised', npc: 'aida', title: 'Une séance ensemble', hint: 'La séance est terminée : reparle à Aïda au café de Fann.',
    text: 'Merci d’avoir révisé avec moi. Expliquer les exercices à quelqu’un m’aide à y voir plus clair !',
    when: (r, s) => r.has('aida_revision_invited') && !r.has('aida_friend') && (s.data.counters.aida_revisions ?? 0) >= 1,
    choices: [
      { id: 'merci', label: 'À bientôt, Aïda', reply: 'À bientôt ! On pourra aussi prendre des nouvelles.', effects: { rel: [[P, 'aida', 9]], counter: 'etudes', flags: ['aida_friend'] } },
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
  {
    id: 'ibou_modou_followup', npc: 'ibou', title: 'Des nouvelles de Modou',
    hint: 'Tu peux donner des nouvelles à Tonton Ibou, devant ta chambre à Pikine.',
    text: 'Tu as pu parler avec Modou ?',
    when: r => r.beatDone('ibou_welcome') && r.has('modou_trust') && !r.has('ibou_modou_followup'),
    choices: [
      { id: 'merci', label: 'Merci pour la recommandation', reply: 'Content que vous ayez pu parler. Pour la suite, vois directement avec lui.', effects: { rel: [[P, 'ibou', 2]], flags: ['ibou_modou_followup'] } },
      { id: 'plus_tard', label: 'Je te raconterai plus tard', reply: 'D’accord, on en reparlera.', effects: {}, completes: false },
    ],
  },
];

export function availableBeat(npc: string, r: Relations, s: GameState): Beat | null {
  return BEATS.find(b => b.npc === npc && !r.beatDone(b.id) && b.when(r, s)) ?? null;
}

/** The one suggested next step (at most one at a time; nothing is compulsory). */
export function suggestion(r: Relations, s: GameState): Beat | null {
  return BEATS.find(b => !r.beatDone(b.id) && b.when(r, s)) ?? null;
}

export function applyChoice(beat: Beat, choice: Choice, r: Relations, s: GameState): string[] {
  // This optional return must not reward stale or foreign choices, including
  // direct callers that do not pass through the UI's interaction-version guard.
  if (beat.id === 'ibou_modou_followup') {
    const authored = BEATS.find(b => b.id === 'ibou_modou_followup')!;
    if (beat !== authored || r.beatDone(beat.id) || !authored.when(r, s) || !authored.choices.includes(choice)) return [];
  }
  // The old invitation ID remains valid, but stale choices and completed saves
  // cannot replay rewards or skip Aïda's revision activity.
  if (beat.npc === 'aida' && (r.beatDone(beat.id) || !beat.when(r, s) || !beat.choices.includes(choice))) return [];
  const e = choice.effects, notes: string[] = [];
  for (const [a, b, d] of e.rel ?? []) {
    r.change(a, b, d);
    if (a === PLAYER || b === PLAYER) {
      const who = castById(a === PLAYER ? b : a);
      if (who && d !== 0) notes.push(`${who.name} ${d > 0 ? '▲' : '▼'}`);
    }
  }
  for (const f of e.flags ?? []) r.set(f);
  if (e.money) s.addMoney(e.money);
  if (e.needs) s.adjust(e.needs);
  if (e.counter) s.count(e.counter);
  if (choice.completes !== false) s.data.beats[beat.id] = choice.id;
  return notes;
}
