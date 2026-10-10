import type { Action } from './types';
import { say } from '../i18n/wolof';
import { haggler, tasteLine } from '../i18n/lines';
import { order, talkFirst } from '../activity/primitives';

const energy = (amount: number): NonNullable<Action['requires']> => s => s.data.needs.energie < amount ? 'Repose-toi avant ce service' : null;

/** Fictional businesses; prices and short activities are game balance, not real offers. */
export const CITY_ACTIONS = {
  landing: [
    { id: 'debarquement', label: 'Débarquer les caisses de poisson', detail: 'Avec l’équipe de pêche · +3 200 F', gain: 3200, needs: { energie: -26, hygiene: -12, faim: -8, social: 4 }, seconds: 6, counter: 'shifts', requires: energy(26) },
    { id: 'filets', label: 'Aider à réparer les filets', detail: 'À l’ombre, avant la prochaine sortie · +1 800 F', gain: 1800, needs: { energie: -14, social: 6 }, seconds: 5, counter: 'shifts', requires: energy(14) },
    { id: 'quai', label: 'Prendre des nouvelles des pêcheurs', detail: `${say('Na nga def ?')} Ça a donné quoi aujourd’hui ?`, needs: { social: 14, moral: 6 }, seconds: 3, counter: 'chats' },
  ],
  fish: [
    // Composed: the price is discussed at the stall (« Ñaata la ? »), the fish is grilled, eaten standing.
    { id: 'poisson-frais', label: 'Commander du poisson grillé', detail: 'Poisson du jour, pain et citron', cost: 1200, needs: { faim: 42, moral: 7 }, seconds: 3, counter: 'meals',
      steps: talkFirst(order({ id: 'poisson-frais', label: 'Commander du poisson grillé', price: 1200, prep: 1.5, eat: 3, seat: false, needs: { faim: 42, moral: 7 }, eatLine: tasteLine }), haggler('buy', 1200, 'La vendeuse'), 'On discute le prix').steps },
    { id: 'poisson-service', label: 'Aider au nettoyage et à la vente', detail: 'Un service avec les mareyeuses · +2 200 F', gain: 2200, needs: { energie: -20, hygiene: -10, social: 5 }, seconds: 5, counter: 'shifts', requires: energy(20) },
  ],
  craft: [
    { id: 'atelier', label: 'Aider à préparer une commande', detail: 'Emballer paniers et objets de bois · +1 600 F', gain: 1600, needs: { energie: -14, moral: 5 }, seconds: 5, counter: 'shifts', requires: energy(14) },
    { id: 'savoir-faire', label: 'Découvrir le travail des artisans', detail: 'Tressage, cuir et petites pirogues peintes', needs: { moral: 10, social: 9 }, seconds: 4, counter: 'visits' },
    { id: 'craft-panier', label: 'Acheter un petit panier tressé', detail: 'Fait main à l’atelier', cost: 1500, needs: { moral: 8 }, seconds: 2 },
  ],
  bank: [
    { id: 'courrier', label: 'Livrer les dossiers de l’agence', detail: 'Une petite mission rémunérée · +2 400 F', gain: 2400, needs: { energie: -20, faim: -5 }, seconds: 5, counter: 'shifts', requires: energy(20) },
    { id: 'conseiller', label: 'Parler de son projet au conseiller', detail: 'Une maison, un commerce… on en parle', needs: { social: 10, moral: 5 }, seconds: 3, counter: 'chats' },
  ],
  mall: [
    { id: 'expo', label: 'Installer les stands d’une exposition', detail: 'Avant l’ouverture · +2 800 F', gain: 2800, needs: { energie: -22, hygiene: -6 }, seconds: 5, counter: 'shifts', requires: energy(22) },
    { id: 'galerie', label: 'Faire le tour de la galerie', detail: 'On regarde les vitrines, tranquille', needs: { moral: 9, social: 6, energie: -3 }, seconds: 4, counter: 'visits' },
  ],
  tech: [
    { id: 'tech-service', label: 'Aider à préparer les commandes', detail: 'Accessoires et petits appareils · +2 000 F', gain: 2000, needs: { energie: -17 }, seconds: 4, counter: 'shifts', requires: energy(17) },
    { id: 'tech-discuter', label: 'Discuter avec le réparateur', detail: 'Les nouvelles du quartier passent aussi ici', needs: { social: 10, moral: 3 }, seconds: 3, counter: 'chats' },
    { id: 'tech-credit', label: 'Recharger son crédit', detail: 'Une carte de recharge · appels et messages', cost: 500, needs: { social: 4, moral: 2 }, seconds: 2 },
  ],
  style: [
    { id: 'tenues', label: 'Voir les tenues de lutte', detail: 'Ngemb et accessoires · aperçu', seconds: 0, special: 'outfit' },
    { id: 'couture', label: 'Aider à préparer une commande', detail: 'Trier les tissus et les fournitures · +1 800 F', gain: 1800, needs: { energie: -16, moral: 4 }, seconds: 4, counter: 'shifts', requires: energy(16) },
    { id: 'style-pagne', label: 'Acheter un pagne wax', detail: 'Six yards, imprimé maison · pour la prochaine tenue', cost: 3000, needs: { moral: 10 }, seconds: 3 },
  ],
  household: [
    { id: 'maison-service', label: 'Ranger les arrivages', detail: 'Vaisselle, lampes et petits meubles · +2 100 F', gain: 2100, needs: { energie: -19, hygiene: -4 }, seconds: 4, counter: 'shifts', requires: energy(19) },
    { id: 'maison-idees', label: 'Chercher des idées pour sa chambre', detail: 'Repérer des couleurs et des objets', needs: { moral: 8 }, seconds: 3, counter: 'visits' },
    { id: 'meubles', label: 'Voir les meubles', detail: 'Livrés dans ta chambre · prix provisoires', seconds: 0, special: 'shop' },
  ],
  juice: [
    { id: 'bouye', label: 'Jus de bouye frais', cost: 500, needs: { faim: 10, energie: 5, moral: 7 }, seconds: 2 },
    { id: 'bissap', label: 'Bissap et sandwich', cost: 1000, needs: { faim: 30, moral: 6 }, seconds: 3, counter: 'meals' },
  ],
  boutique: [
    // Composed: « Ñaata la ? » at the counter (no haggling over bread and milk), then breakfast standing.
    { id: 'pain-lait', label: 'Pain et lait', detail: 'Le petit-déjeuner du coin', cost: 400, needs: { faim: 25, energie: 4 }, seconds: 2, counter: 'meals',
      steps: talkFirst(order({ id: 'pain-lait', label: 'Pain et lait', price: 400, prep: 1, eat: 2, seat: false, needs: { faim: 25, energie: 4 } }), haggler('buy', 400, 'Le boutiquier', false), 'Au comptoir', 1.6).steps },
    { id: 'boutique-stock', label: 'Aider à ranger le stock', detail: 'Un service à la boutique · +1 500 F', gain: 1500, needs: { energie: -15, hygiene: -4, social: 4 }, seconds: 4, counter: 'shifts', requires: energy(15) },
    { id: 'boutique-salut', label: 'Prendre des nouvelles de Mamadou', detail: `Salaam aleekum ! ${say('Ana waa kër gi ?')}`, needs: { social: 11, moral: 4 }, seconds: 3, counter: 'chats' },
  ],
  salon: [
    { id: 'coiffure', label: 'Se faire coiffer', detail: 'Un moment pour soi', cost: 1500, needs: { moral: 14, hygiene: 8, social: 5 }, seconds: 4 },
    { id: 'salon-parler', label: 'Écouter les nouvelles du quartier', detail: 'Le salon a toujours une histoire', needs: { social: 13, moral: 5 }, seconds: 3, counter: 'chats' },
  ],
  square: [
    { id: 'attaya-place', label: 'Partager l’attaya', detail: `${say('Kaay naan attaya')} · prendre le temps ensemble`, cost: 100, needs: { social: 18, moral: 9, energie: 3 }, seconds: 4, counter: 'chats' },
    { id: 'dames', label: 'Regarder la partie de dames', detail: 'Les commentaires font partie du spectacle', needs: { social: 10, moral: 9 }, seconds: 3, counter: 'visits' },
    { id: 'banc', label: 'Se poser à l’ombre', detail: 'Souffler et regarder la ville vivre', needs: { energie: 10, moral: 6 }, seconds: 4 },
  ],
} satisfies Record<string, Action[]>;
