import type { GameModule } from './modules';
import type { GameState } from '../core/state';
import type { Action, Interactable } from '../world/types';
import { apprentiLine } from '../i18n/lines';

/**
 * Pikine's gare (the dense station built in src/world/builder.ts `pikineGare`): what you can do there, and its noise.
 * Plain data on the existing action runner: a line when the step starts, needs, counters, money, flags.
 * The apprentices at the cars and the queues at their doors come from the apprentice and ambient-life systems; the
 * gossip and the arguments are provisional texts (Unreviewed). Flags: met_apprenti, helped_gare, heard_gare_gossip.
 */
const DESTINATIONS = ['Parcelles', 'Guédiawaye', 'Plateau', 'Thiaroye'];
const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
const has = (s: GameState, f: string) => s.data.flags.includes(f);
const say = (who: string, text: string) => `${who} : « ${text} »`;

export function gareActions(state: () => GameState, hour: () => number) {
  const apprenti: Action[] = [
    { id: 'parler_apprenti', label: 'Parler à l’apprenti', detail: 'Il crie les destinations, la main sur la barre', seconds: 3, steps: [{
      label: 'Discussion', primitive: 'talk', seconds: 3, clip: 'Talk',
      line: () => (has(state(), 'met_apprenti') ? apprentiLine(DESTINATIONS, Math.random()) : say('L’apprenti', 'Tu vas où, grand ? Monte, monte, on part tout de suite ! Parcelles, Guédiawaye, Plateau !')),
      effects: { needs: { social: 6, moral: 2 }, counters: { chats: 1 }, flags: ['met_apprenti'] } }] },
    { id: 'demander_prix', label: 'Demander le prix', detail: 'Le prix annoncé, puis le prix pour toi', seconds: 2.5, steps: [{
      label: 'Marchandage', primitive: 'talk', seconds: 2.5, clip: 'Talk',
      line: () => say('L’apprenti', pick(['Plateau, trois cents. Pour toi, deux cent cinquante, parce que c’est toi.', 'Guédiawaye, deux cents. Avec la valise, c’est cinquante de plus.', 'Parcelles, cent cinquante. Le car est presque plein, grand !'])),
      effects: { needs: { social: 3 } } }] },
    { id: 'attendre_car', label: 'Attendre un car', detail: 'Regarder les cars se remplir et partir', seconds: 8, steps: [{
      label: 'Tu attends', primitive: 'wait', seconds: 8,
      line: () => pick(['Un car se remplit, un autre part en klaxonnant. Il faut de la patience.', 'On dit qu’il part quand il est plein. Il n’est jamais plein.', 'Le soleil tape sur la tôle ; l’abri est bondé.']),
      effects: { needs: { energie: 3, moral: 1 } } }] },
  ];
  const bagages: Action[] = [
    { id: 'charger_sac', label: 'Aider à charger un sac', detail: '+500 F · un peu de fatigue', gain: 500, seconds: 4,
      requires: s => (s.data.needs.energie < 15 ? 'Trop fatigué' : null), steps: [{
      label: 'Hisser le sac', primitive: 'work', seconds: 4, clip: 'Grab',
      line: () => say('Une cliente', pick(['Doucement avec ça, il y a des assiettes dedans !', 'Sur le toit, bien attaché, hein ?', 'Merci, mon fils. Tiens, pour ta peine.'])),
      effects: { money: 500, category: 'transport', needs: { energie: -10, hygiene: -4, faim: -3, social: 3 }, counters: { shifts: 1 }, flags: ['helped_gare'] } }] },
    { id: 'charger_colis', label: 'Charger un gros colis sur la galerie', detail: '+1 200 F · fatigant', gain: 1200, seconds: 6,
      requires: s => (s.data.needs.energie < 28 ? 'Trop fatigué' : null), steps: [{
      label: 'Monter le colis', primitive: 'work', seconds: 6, clip: 'Grab',
      line: () => say('L’apprenti', 'Un, deux, trois… hop ! Attache bien la corde, grand !'),
      effects: { money: 1200, category: 'transport', needs: { energie: -22, hygiene: -8, faim: -7, moral: 3, social: 2 }, counters: { shifts: 1 }, flags: ['helped_gare'] } }] },
  ];
  const vendeur: Action[] = [
    { id: 'eau_gare', label: 'Acheter un sachet d’eau', detail: 'Frais, 50 F', cost: 50, seconds: 1.5, steps: [{
      label: 'Sachet d’eau', primitive: 'drink', seconds: 1.5, line: 'Vendeur : « De l’eau fraîche, de l’eau fraîche ! Cinquante francs ! »', effects: { needs: { energie: 2, moral: 1 } } }] },
    { id: 'cacahuetes_gare', label: 'Acheter des cacahuètes', detail: 'Un cornet, 100 F', cost: 100, seconds: 1.5, steps: [{
      label: 'Cacahuètes', primitive: 'eat', seconds: 1.5, line: 'Vendeuse : « Cacahuètes grillées, chaudes, chaudes ! »', effects: { needs: { faim: 8, moral: 2 } } }] },
    { id: 'mouchoirs_gare', label: 'Acheter des mouchoirs', detail: 'Un paquet, 100 F', cost: 100, seconds: 1.2, steps: [{
      label: 'Mouchoirs', primitive: 'buy', seconds: 1.2, line: 'Vendeur : « Les mouchoirs, la poussière c’est pour tout le monde ! »', effects: { needs: { hygiene: 6 } } }] },
    { id: 'credit_gare', label: 'Acheter du crédit téléphone', detail: '500 F', cost: 500, seconds: 1.5, steps: [{
      label: 'Crédit', primitive: 'buy', seconds: 1.5, line: 'Vendeur : « Crédit, crédit ! Je te mets cinq cents, tu vas appeler ta mère ! »', effects: { needs: { social: 6, moral: 3 } } }] },
  ];
  const the: Action[] = [
    { id: 'attaya_gare', label: 'Boire un attaya', detail: 'Trois verres, 100 F', cost: 100, seconds: 3, steps: [{
      label: 'Attaya', primitive: 'drink', seconds: 3, prop: 'glass', line: 'Le faiseur d’attaya : « Le premier est fort comme la mort, le deuxième doux comme la vie, le troisième sucré comme l’amour. »',
      effects: { needs: { energie: 5, moral: 5, social: 3, faim: 1 }, counters: { cafes: 1 } } }] },
    { id: 'commerages_gare', label: 'Écouter les commérages', detail: 'On y apprend tout avant les journaux', seconds: 4, steps: [{
      label: 'Tu écoutes', primitive: 'wait', seconds: 4, clip: 'Talk',
      line: () => {
        const h = hour(), base = ['On dit que le loyer va encore monter à Parcelles.', 'Tu as vu le car de Guédiawaye ? Même l’apprenti n’a plus de voix.', 'Le chauffeur du 12 s’est disputé avec le receveur : trois cents francs pour une valise !', 'Ma cousine de Thiaroye dit que l’eau est montée jusqu’à la porte l’an dernier.'];
        const timed = h >= 5 && h < 11 ? ['Les premiers cars étaient pleins avant le lever du soleil.'] : h >= 16 && h < 20 ? ['Le combat de ce soir à l’arène : tout le monde en parle, personne n’a de billet.'] : ['La chaleur ! On attend le soir pour respirer.'];
        return say('Quelqu’un à la table', pick([...base, ...timed]));
      },
      effects: { needs: { social: 5, moral: 1 }, counters: { chats: 1 }, flags: ['heard_gare_gossip'] } }] },
  ];
  const dispute: Action[] = [
    { id: 'ecouter_dispute', label: 'Écouter la dispute', detail: 'Le prix, la route, le bagage de trop', seconds: 3, steps: [{
      label: 'Tu écoutes', primitive: 'wait', seconds: 3,
      line: () => pick(['« Deux cents, pas un franc de plus ! » — « Alors prends le suivant, grand-mère ! »', '« Tu as dit Guédiawaye, pas Thiaroye ! » — « C’est la même route ! »', '« Ta valise, elle prend trois places ! » — « C’est mon trousseau, un peu de respect ! »']),
      effects: { needs: { social: 3 } } }] },
  ];
  return { apprenti, bagages, vendeur, the, dispute };
}

/** Where things stand, from the station's own interaction (« Car rapide · changer de quartier » at the centre − 3, + 3.2). */
function placesAt(cx: number, cz: number, A: ReturnType<typeof gareActions>): Interactable[] {
  return [
    { id: 'pikine:gare:apprenti', name: 'Apprenti du car', kind: 'actions', x: cx - 8.2, z: cz + 0.3, radius: 3.2, actions: A.apprenti, description: 'Un apprenti à la porte arrière, la main sur la barre : il crie les destinations.' },
    { id: 'pikine:gare:bagages', name: 'Bagages et colis', kind: 'actions', x: cx - 10.6, z: cz - 4.2, radius: 3.2, actions: A.bagages, description: 'Sacs, ballots et valises à hisser sur la galerie.' },
    { id: 'pikine:gare:vendeurs', name: 'Vendeurs ambulants', kind: 'actions', x: cx - 3, z: cz - 7, radius: 4.4, actions: A.vendeur, description: 'Eau, cacahuètes, mouchoirs, crédit : ils passent entre les cars.' },
    { id: 'pikine:gare:the', name: 'Attaya du gare', kind: 'actions', x: cx + 15, z: cz - 2, radius: 3.6, actions: A.the, description: 'Un coin à thé sous une tôle, où l’on sait tout ce qui se dit.' },
    { id: 'pikine:gare:dispute', name: 'Dispute au sujet du prix', kind: 'actions', x: cx - 9.5, z: cz - 9, radius: 3, actions: A.dispute },
  ];
}

const NOISE = ['Klaxons, moteurs et cris : le gare ne dort jamais.', 'L’apprenti : « Parcelles ! Guédiawaye ! Plateau ! »', 'Un car klaxonne pour se frayer un passage.', 'Quelqu’un hurle un prix, quelqu’un d’autre le conteste.', 'Une porte de car claque, un sac tombe : « Doucement ! »'];

let centre: { x: number; z: number } | null = null, nextNoise = 0, wasNear = false;
export const gareModule: GameModule = {
  name: 'pikine-gare',
  hubLoaded(ctx, hub) {
    centre = null; nextNoise = 0; wasNear = false;
    if (hub.id !== 'pikine') return;
    const st = hub.interactables.find(i => i.id === 'pikine:station'); if (!st) return;
    centre = { x: st.x + 3, z: st.z - 3.2 };
    hub.interactables.push(...placesAt(centre.x, centre.z, gareActions(() => ctx.state, () => ctx.hour())));
  },
  update(ctx) {
    if (!centre || ctx.world()?.id !== 'pikine' || ctx.mode() !== 'play' || ctx.space() !== 'street') return;
    const d = Math.hypot(ctx.player.pos.x - centre.x, ctx.player.pos.z - centre.z), near = d < 13, t = ctx.now() / 1000;
    if (near && !wasNear) nextNoise = t + 1.5;                       // the din greets you on arrival, then comes and goes
    wasNear = near;
    if (near && t >= nextNoise) { ctx.toast(pick(NOISE)); nextNoise = t + 30 + Math.random() * 25; }
  },
};
