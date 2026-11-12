import type { HubId } from '../core/types';
import type { GameState } from '../core/state';
import { Relations, PLAYER } from './relations';
import { applyEffects, type Effects } from './beats';
import { say } from '../i18n/wolof';
import { boutWithin, isRegular } from './memory';

/**
 * Replayable everyday situations (one per city day each): a short branching scene with a choice and a consequence
 * that the characters remember. Texts vary with what happened before and with who is there.
 * French with everyday Wolof from src/i18n/wolof.ts.
 */
export interface SitCtx { r: Relations; s: GameState; present: Set<string>; day: number; times: number; last: string | null }
export interface SitChoice {
  id: string; label: string;
  reply: string | ((x: SitCtx) => string);
  effects: Effects;
  show?: (x: SitCtx) => boolean;
  /** A counter consumed by this choice (e.g. the sugar bought at the boutique). */
  uses?: string;
}
export interface Situation {
  id: string; title: string; hub: HubId;
  /** The character who hosts it; `with` may join when their routine brings them to the same place. */
  host: string; with: string[];
  /** Routine place key where the host must be (PlaceSpec.at). */
  at: string;
  hours: [number, number];
  detail: string;
  text: (x: SitCtx) => string;
  choices: SitChoice[];
}
export const sitKey = { n: (id: string) => `sit_${id}_n`, day: (id: string) => `sit_${id}_day`, last: (id: string) => `sit_${id}_last` };
const P = PLAYER;

export const SITUATIONS: Situation[] = [
  {
    id: 'maiga_repas', title: 'Repas partagé à la Maïga', hub: 'pikine', host: 'babacar', with: ['ibou', 'modou'], at: 'maiga', hours: [13, 15],
    detail: 'Situation · le déjeuner de la Maïga',
    text: x => {
      const who = [x.present.has('modou') ? 'Modou' : '', x.present.has('ibou') ? 'Tonton Ibou' : ''].filter(Boolean).join(' et ');
      const around = who ? ` ${who} ${who.includes(' et ') ? 'sont' : 'est'} sur le banc.` : '';
      if (x.last === 'payer') return `Babacar se lève en te voyant : « Aujourd’hui, c’est moi qui invite ! L’écurie m’a donné une petite prime. »${around}`;
      if (x.last === 'rien') return `Babacar fixe son assiette vide.${around} « La dernière fois, c’est Modou qui a payé pour moi… je n’ose plus rien demander. »`;
      if (x.times > 0) return `La Maïga est pleine à midi. Babacar te fait une place.${around} « Le mafé est bon aujourd’hui… quand on peut le payer. »`;
      return `Midi passé à la Maïga.${around} Babacar retourne ses poches : « ${say('Dama xiif')}… J’ai laissé mon argent à l’écurie, et Mame Diarra me fait déjà crédit. Je n’ose plus lui demander. »`;
    },
    choices: [
      { id: 'accepter', label: 'Accepter son invitation', show: x => x.last === 'payer', reply: '« Voilà, on est quittes. Enfin… presque. »', effects: { rel: [[P, 'babacar', 4]], needs: { faim: 40, social: 8, moral: 4 }, counter: 'meals' } },
      { id: 'payer', label: 'Payer son plat et le tien (−1 000 F)', show: x => x.last !== 'payer', reply: x => `Babacar pose la main sur son cœur : « ${say('Jërëjëf')}. Je n’oublierai pas. »${x.present.has('modou') ? ' Modou hoche la tête, l’air de dire « bien ».' : ''}`, effects: { money: -1000, rel: [[P, 'babacar', 10], [P, 'modou', 2], [P, 'ibou', 2]], needs: { faim: 40, social: 10, moral: 6 }, flags: ['babacar_doit'], counter: 'meals' } },
      { id: 'partager', label: 'Partager ton plat avec lui (−500 F)', show: x => x.last !== 'payer', reply: 'Vous mangez dans le même bol. Babacar raconte son prochain combat la bouche pleine ; tout le banc rit.', effects: { money: -500, rel: [[P, 'babacar', 6]], needs: { faim: 22, social: 12, moral: 6 }, counter: 'meals' } },
      { id: 'rien', label: 'Manger sans rien dire (−500 F)', show: x => x.last !== 'payer', reply: x => (x.present.has('modou') ? 'Modou soupire et paie pour Babacar : « Les jeunes d’aujourd’hui… » Il te regarde à peine.' : 'Babacar mange du pain sec en regardant la rue.'), effects: { money: -500, rel: [[P, 'babacar', -3], [P, 'modou', -1], ['modou', 'babacar', 2]], needs: { faim: 40 }, counter: 'meals' } },
    ],
  },
  {
    id: 'attaya_place', title: 'L’attaya de la grand-place', hub: 'pikine', host: 'ibou', with: ['mamadou', 'modou'], at: 'city:square', hours: [17, 22],
    detail: 'Situation · le thé du soir',
    text: x => {
      const guest = x.present.has('mamadou') ? ' Mamadou Diallo est là avec un paquet de sucre — « pour équilibrer, dit-il, Ibou sucre trop ».' : x.present.has('modou') ? ' Modou, encore en bleu de travail, garde la place à côté de lui.' : '';
      const fight = boutWithin(x.s, x.day, 'V', 2) ? ' Les verres se lèvent : « Le lutteur est là ! »' : boutWithin(x.s, x.day, 'D', 2) ? ' Ibou te tend un verre sans rien dire : on ne parle pas d’un combat perdu avant le deuxième thé.' : '';
      return (x.times === 0 ? `Sur la grand-place, Ibou fait chauffer la théière. « ${say('Toogal')}, le premier verre est presque prêt. »` : '« Encore toi ! Tu deviens un habitué de mon attaya. »') + fight + guest;
    },
    choices: [
      { id: 'mousse', label: 'Proposer de faire la mousse', reply: x => (x.times === 0 || x.last !== 'mousse' ? 'Ibou goûte et grimace : « Trop de sucre ! » Tout le monde rit. « Mamadou va encore dire que c’est ma faute. »' : '« Tu progresses. Encore quelques soirs et je te laisse la théière. »'), effects: { rel: [[P, 'ibou', 4]], needs: { social: 12, moral: 6 } } },
      { id: 'nouvelles', label: 'Écouter les nouvelles du quartier', show: x => x.present.has('mamadou'), reply: 'Mamadou baisse la voix : « Thierno ne peut pas quitter le comptoir et Mame Diarra attend son riz. Si tu as des bras, passe à la boutique. »', effects: { rel: [[P, 'mamadou', 3], [P, 'ibou', 2]], needs: { social: 10 }, flags: ['info_livraison'] } },
      { id: 'cousin', label: 'Écouter les nouvelles du quartier', show: x => !x.present.has('mamadou'), reply: 'Ibou baisse la voix : « Mon cousin Ousmane, à l’embarcadère de Ngor, cherche quelqu’un de sérieux pour faire traverser ses clients jusqu’à l’île. Dis-lui que tu viens de ma part. »', effects: { rel: [[P, 'ibou', 4]], needs: { social: 10 }, flags: ['info_ousmane'] } },
      { id: 'sucre', label: 'Offrir le sucre acheté chez Mamadou', show: x => (x.s.data.counters.sucre ?? 0) > 0, uses: 'sucre', reply: x => (x.present.has('mamadou') ? 'Mamadou reconnaît le paquet : « C’est mon sucre ! Au moins, il revient à la maison. »' : `« ${say('Jërëjëf')} ! Le sucre de Mamadou… Il va dire que je lui fais de la publicité. »`), effects: { rel: [[P, 'ibou', 6], [P, 'mamadou', 3]], needs: { social: 14, moral: 8 } } },
      { id: 'raconter', label: 'Raconter ton dernier combat', show: x => boutWithin(x.s, x.day, 'V', 2) || boutWithin(x.s, x.day, 'D', 2),
        reply: x => (boutWithin(x.s, x.day, 'V', 2) ? 'Tu racontes la prise, le public, le bruit. Modou frappe dans ses mains, Ibou hoche la tête : « Voilà ce que je disais. »' : 'Tu racontes sans te ménager. Ibou verse le deuxième verre : « Celui qui raconte sa défaite a déjà commencé à gagner. »'),
        effects: { rel: [[P, 'ibou', 2], [P, 'modou', 1]], needs: { social: 8, moral: 4 } } },
      { id: 'partir', label: 'Partir avant la fin', reply: `« Déjà ? On ne se lève pas au milieu de l’attaya, voyons… Bon, va. ${say('Ba ci kanam')} : on te garde ton verre. »`, effects: { rel: [[P, 'ibou', -1]] } },
    ],
  },
  {
    id: 'boutique_comptoir', title: 'Au comptoir de la Boutique Diallo', hub: 'pikine', host: 'mamadou', with: ['ibou'], at: 'boutique', hours: [9, 19],
    detail: 'Un moment au comptoir',
    text: x => {
      const ibou = x.present.has('ibou') ? ' Tonton Ibou, accoudé au comptoir, discute le prix du sucre.' : '';
      if (boutWithin(x.s, x.day, 'V', 2)) return `Mamadou lève les yeux : « Les clients ne parlent que de ton combat ! »${ibou}`;
      if (boutWithin(x.s, x.day, 'D', 2)) return `Mamadou pousse un verre de thé vers toi : « Un combat perdu, ça arrive. Ici, personne ne t’en veut. »${ibou}`;
      if (x.r.has('mamadou_trust') && isRegular(x.s, 'mamadou')) return `« Le riz que tu as livré s’est vendu comme du pain ! » Mamadou te fait de la place derrière le comptoir.${ibou}`;
      if (isRegular(x.s, 'mamadou')) return (x.times > 0 ? '« Encore toi ! Le quartier passe par ici, et toi aussi, maintenant. »' : '« L’habitué ! » Mamadou pousse un tabouret.') + ibou;
      return `Mamadou range des paquets de thé. « ${say('Ana waa kër gi ?')} Tu cherches quelque chose, ou tu regardes ? »${ibou}`;
    },
    choices: [
      { id: 'nouvelles', label: 'Écouter les nouvelles du comptoir', reply: x => (x.present.has('ibou') ? 'Ibou baisse la voix : « Ce soir, attaya sur la grand-place. Mamadou apporte le sucre, et moi la théière. »' : 'Mamadou compte ses billets : « Ce soir, Ibou fait l’attaya sur la grand-place. Passe, il y a toujours un verre pour un visage connu. »'), effects: { needs: { social: 7, moral: 3 }, rel: [[P, 'mamadou', 1]] } },
      { id: 'ranger', label: 'Aider à ranger les étagères', reply: x => (isRegular(x.s, 'mamadou') ? '« Voilà qui est fait. Tu connais la boutique mieux que mon neveu ! »' : '« Merci, ça m’évite de monter sur l’escabeau. »'), effects: { needs: { energie: -6, moral: 4 }, rel: [[P, 'mamadou', 2]], counter: 'boutique_help' } },
      { id: 'the', label: 'Accepter le premier verre', show: x => isRegular(x.s, 'mamadou'), reply: '« Le premier verre est pour toi, c’est la règle de la maison. »', effects: { needs: { moral: 6, social: 5 } } },
      { id: 'passer', label: 'Juste passer', reply: '« Reviens quand tu veux. »', effects: {} },
    ],
  },
  {
    id: 'gargote_midi', title: 'Le service de midi chez Mame Diarra', hub: 'pikine', host: 'mame', with: ['ablaye'], at: 'gargote', hours: [11, 15],
    detail: 'Un moment à la gargote',
    text: x => {
      const coach = x.present.has('ablaye') ? ' Coach Ablaye mange au bout du banc, sans un mot de trop.' : '';
      if (boutWithin(x.s, x.day, 'V', 2)) return `Mame t’apporte une louche de plus avant que tu demandes : « Le lutteur ! Mange, il te faut des forces. »${coach}`;
      if (boutWithin(x.s, x.day, 'D', 2)) return `Mame te regarde longuement, puis pose un plat devant toi : « Mange. Un combat perdu, ça se digère avec du ceebu. »${coach}`;
      if (x.r.has('mame_helped') && x.times === 0) return `« Ta place est gardée ! » Mame essuie le bout du banc de son pagne.${coach}`;
      if (isRegular(x.s, 'mame')) return `La salle est pleine. Mame te fait un signe : « Comme d’habitude ? Assieds-toi, ${say('sama doom')}. »${coach}`;
      return `Midi à la gargote : les assiettes passent, les voix montent. Mame te jette un coup d’œil : « Une place au fond, si tu ne fais pas de bruit. »${coach}`;
    },
    choices: [
      { id: 'ecouter', label: 'Prendre une place et écouter la salle', reply: x => (x.present.has('ablaye') ? 'À côté, Ablaye parle de patience, de sable et de respect. Tu manges sans parler, et tu retiens tout.' : 'Autour de toi, on parle de la pluie, des prix et du prochain combat. Tu te sens un peu du quartier.'), effects: { needs: { social: 8, moral: 4 } } },
      { id: 'service', label: 'Donner un coup de main au service', reply: x => (x.r.has('mame_helped') ? 'Mame te glisse une cuillère de ceebu : « Pour toi, pas pour les clients. »' : 'Mame hoche la tête : « Tu portes bien les plats. Reviens. »'), effects: { needs: { energie: -8, moral: 5, faim: 8 }, rel: [[P, 'mame', 2]], counter: 'gargote_help' } },
      { id: 'coach', label: 'Parler d’entraînement avec Ablaye', show: x => x.present.has('ablaye'), reply: x => (boutWithin(x.s, x.day, 'V', 2) || boutWithin(x.s, x.day, 'D', 2) ? '« J’ai entendu pour ton combat. On en parle demain, à l’écurie, quand la tête sera claire. »' : '« Viens à l’écurie quand tu veux. L’entraînement ne ment pas. »'), effects: { needs: { social: 4 }, rel: [[P, 'ablaye', 2]] } },
      { id: 'passer', label: 'Juste dire bonjour', reply: '« À bientôt, alors. »', effects: {} },
    ],
  },
  {
    id: 'garage_etabli', title: 'L’établi du Garage Modou', hub: 'pikine', host: 'modou', with: [], at: 'garage', hours: [7, 19],
    detail: 'Un moment au garage',
    text: x => {
      if (boutWithin(x.s, x.day, 'V', 2)) return 'Modou t’accueille les mains noires de cambouis : « Alors, champion ! Tu pousses les voitures comme les adversaires ? »';
      if (boutWithin(x.s, x.day, 'D', 2)) return 'Modou essuie ses mains : « Un combat perdu, ça se répare, comme un moteur. On ne jette pas une voiture pour une panne. »';
      if (x.r.has('babacar_rendu')) return '« Babacar est passé : il dit que tu es un homme de parole. » Modou sourit sans lever les yeux de son moteur.';
      if (x.r.has('modou_trust') && x.times === 0) return `« ${say('Kaay fi')}, mon bon aide ! Tiens-moi cette lampe, j’ai une boîte de vitesses qui boude. »`;
      if (isRegular(x.s, 'modou')) return 'Modou ne se retourne pas : « Je t’ai entendu venir. Le garage te connaît, maintenant. »';
      return 'Modou, sous une voiture, ne sort que ses bottes : « Passe-moi la clé de douze… non, l’autre. Ah, tu n’es pas mon apprenti. »';
    },
    choices: [
      { id: 'lampe', label: 'Tenir la lampe pendant qu’il répare', reply: x => (x.r.has('modou_trust') ? '« Voilà, tu vois la panne ? Un jour tu la verras avant moi. »' : 'Tu éclaires. Modou grogne, serre, sourit : « Ça démarre ! Merci. »'), effects: { needs: { energie: -5, moral: 3 }, rel: [[P, 'modou', 2]], counter: 'garage_help' } },
      { id: 'pannes', label: 'Écouter ses histoires de pannes', reply: x => (x.times > 0 ? '« La Peugeot du marchand ? Elle est revenue, avec le même bruit ! » Tu ris, il rit plus fort.' : '« Une fois, une voiture est arrivée en remorque… avec une chèvre dedans. » Il en rit encore.'), effects: { needs: { social: 6, moral: 3 } } },
      { id: 'passer', label: 'Juste passer', reply: '« Repasse quand tu veux, la porte est ouverte. »', effects: {} },
    ],
  },
];

export function sitCtx(sit: Situation, r: Relations, s: GameState, present: Set<string>, day: number): SitCtx {
  const c = s.data.counters, li = c[sitKey.last(sit.id)] ?? 0;
  return { r, s, present, day, times: c[sitKey.n(sit.id)] ?? 0, last: li ? sit.choices[li - 1]?.id ?? null : null };
}

/** The situation this character can open now: they take part, the host is at its place, the hour fits, not yet played today. */
export function situationFor(npc: string, hour: number, hostAt: (host: string) => string | null, s: GameState, day: number): Situation | null {
  return SITUATIONS.find(sit => (sit.host === npc || sit.with.includes(npc))
    && hour >= sit.hours[0] && hour < sit.hours[1]
    && hostAt(sit.host) === sit.at
    && s.data.counters[sitKey.day(sit.id)] !== day) ?? null;
}
export const choicesFor = (sit: Situation, x: SitCtx) => sit.choices.filter(c => !c.show || c.show(x));

/** Play one choice: effects, memory of the choice (counters), the day it was played. Returns the reply and notes. */
export function playSituation(sit: Situation, choice: SitChoice, x: SitCtx): { reply: string; notes: string[] } {
  const reply = typeof choice.reply === 'string' ? choice.reply : choice.reply(x);
  const notes = applyEffects(choice.effects, x.r, x.s, sit.title);
  if (choice.uses) x.s.data.counters[choice.uses] = Math.max(0, (x.s.data.counters[choice.uses] ?? 0) - 1);
  const c = x.s.data.counters;
  c[sitKey.n(sit.id)] = (c[sitKey.n(sit.id)] ?? 0) + 1;
  c[sitKey.day(sit.id)] = x.day;
  c[sitKey.last(sit.id)] = sit.choices.indexOf(choice) + 1;
  return { reply, notes };
}

/** Favours a character owes after a remembered event (used once). */
export interface Favour { npc: string; needs: string; done: string; label: string; detail: string; apply: (r: Relations, s: GameState) => string }
export const FAVOURS: Favour[] = [
  {
    npc: 'babacar', needs: 'babacar_doit', done: 'babacar_rendu', label: 'Babacar te rend la pareille', detail: 'Il se souvient du repas de la Maïga',
    apply: (r, s) => {
      r.set('babacar_rendu'); r.change(P, 'babacar', 4);
      if (r.has('ecurie_baobab')) { s.count('lutte'); r.change(P, 'ablaye', 2); return `« ${say('Kaay fi')}, je te montre la prise d’épaule qui m’a fait gagner. » (Lutte +1)`; }
      r.set('reco_ablaye'); r.change(P, 'ablaye', 6);
      return '« Tu as le gabarit. Je parle de toi à Coach Ablaye, il t’attend à l’écurie. »';
    },
  },
];
export const favourFor = (npc: string, r: Relations) => FAVOURS.find(f => f.npc === npc && r.has(f.needs) && !r.has(f.done)) ?? null;
