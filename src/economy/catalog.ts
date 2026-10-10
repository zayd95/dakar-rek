import type { HubId, Needs } from '../core/types';
import type { SeatKind } from '../interact/seats';
import { STARTER_HOME } from '../core/save';
import { ECONOMY } from './config';

/**
 * The catalogue of everything a player can own or rent (docs/OWNERSHIP.md): what each thing is, where it is, what it
 * costs and brings. Pure data, separate from the save state (src/core/types.ts AssetState) and from the logic
 * (src/economy/assets.ts). These are the game's own prices: the economy is virtual and uncapped (Habib, 9 Oct 2026),
 * so the ladders climb to hundreds of millions and billions. Every name, brand and place here is fictional.
 */
export type AssetKind = 'home' | 'land' | 'billboard' | 'vehicle' | 'business' | 'furniture' | 'aircraft';
export const KIND_LABEL: Record<AssetKind, string> = {
  home: 'Logement', land: 'Terrain', billboard: 'Panneau publicitaire', vehicle: 'Véhicule', business: 'Affaire', furniture: 'Meuble', aircraft: 'Avion',
};
export const KIND_ICON: Record<AssetKind, string> = { home: '🏠', land: '🟫', billboard: '🪧', vehicle: '🚗', business: '🏪', furniture: '🛋️', aircraft: '✈️' };

export interface Upgrade {
  id: string; name: string; what: string; price: number;
  /** Multiplies the rent the asset brings when it is let. */
  rentMult?: number;
  /** Energy added to a night's sleep in this home. */
  comfort?: number;
}

export interface AssetSpec {
  id: string;
  kind: AssetKind;
  name: string;
  /** One line for the sheets. */
  what: string;
  /** Purchase price (F). Absent: not for sale (lent, rent only). */
  price?: number;
  /** Lease per in-game day (F), for the homes one can rent. */
  rent?: number;
  /** Per in-game hour of play (F): what a venture produces, or what the asset brings once let (land, billboard, home). */
  income?: number;
  /** Charges per in-game hour of play while owned (upkeep of the big homes). */
  upkeep?: number;
  /** Condition lost per in-game day (sun and dust on a billboard). */
  wear?: number;
  /** Where it stands: hub, place id (src/activity/places.ts) and a name for the sheets. */
  hub?: HubId; place?: string; where?: string;
  /** Surface (m²). */
  size?: number;
  /** Step on its ladder (homes 1–5, ventures 1–7). */
  tier?: number;
  upgrades?: Upgrade[];
  /** Content still to come (never a permission): why it cannot be bought or used yet. */
  soon?: string;
}

// ------------------------------------------------------------------ homes: room → apartment → house → villa → luxury residence
export type HomeLevel = 'room' | 'apartment' | 'house' | 'villa' | 'residence';
export interface HomeSpec extends AssetSpec {
  kind: 'home';
  /** Interior size (m) and the street door that leads to it (an interactable id of the hub). */
  home: { level: HomeLevel; w: number; d: number; door: string; floor: 'tiles' | 'wood' | 'marble' };
}
const P = ECONOMY.property;
/** What an owned home brings per in-game hour once let to someone else (its rent, less the agency's share). */
const letIncome = (rentPerDay: number) => Math.round((rentPerDay / 24) * P.letShare);
const COMFORT: Upgrade[] = [
  { id: 'ventilo', name: 'Ventilateur au plafond', what: 'Des nuits plus fraîches : +10 énergie au réveil', price: 45_000, comfort: 10 },
  { id: 'peinture', name: 'Peinture neuve', what: 'Murs repeints : le logement se loue mieux (+10 %)', price: 120_000, rentMult: 1.1 },
];
export const HOMES: HomeSpec[] = [
  { id: STARTER_HOME, kind: 'home', name: 'Ta chambre · Pikine', what: 'La chambre que la famille te prête, en face de la Cité Jàmm', hub: 'pikine', where: 'Pikine', size: 29, tier: 1,
    upgrades: [{ id: 'moustiquaire', name: 'Moustiquaire', what: 'Des nuits sans moustiques : +8 énergie au réveil', price: 6_000, comfort: 8 }], home: { level: 'room', w: 6, d: 4.8, door: 'pikine:home:11', floor: 'tiles' } },
  { id: 'appart_jamm', kind: 'home', name: 'Appartement F2 · Résidence Jàmm', what: 'Salon, coin cuisine et douche au premier étage, face à la grand-rue', price: 15_000_000, rent: 6_000, income: letIncome(6_000),
    hub: 'pikine', place: 'jamm', where: 'Pikine · Cité Jàmm', size: 52, tier: 2, upgrades: COMFORT, home: { level: 'apartment', w: 8, d: 6.5, door: 'pikine:home:jamm', floor: 'tiles' } },
  { id: 'maison_cite', kind: 'home', name: 'Maison familiale · Cité Jàmm', what: 'Une maison avec cour, grand salon et cuisine, au bout de la cité', price: 90_000_000, rent: 30_000, income: letIncome(30_000), upkeep: 100,
    hub: 'pikine', place: 'maison', where: 'Pikine · Cité Jàmm', size: 150, tier: 3, upgrades: [...COMFORT, { id: 'clim', name: 'Climatisation', what: 'Fraîcheur toute l’année : +15 énergie au réveil, loyer +15 %', price: 650_000, comfort: 15, rentMult: 1.15 }],
    home: { level: 'house', w: 11, d: 8, door: 'pikine:home:maison', floor: 'wood' } },
  { id: 'villa_almadies', kind: 'home', name: 'Villa avec piscine · Almadies', what: 'Grand séjour ouvert sur la piscine, à deux rues de l’océan', price: 400_000_000, rent: 120_000, income: letIncome(120_000), upkeep: 500,
    hub: 'almadies', place: 'villa', where: 'Almadies', size: 420, tier: 4, upgrades: [{ id: 'clim', name: 'Climatisation', what: '+15 énergie au réveil, loyer +15 %', price: 2_500_000, comfort: 15, rentMult: 1.15 }, { id: 'jardin', name: 'Jardin paysager', what: 'Bougainvilliers et palmiers : loyer +20 %', price: 8_000_000, rentMult: 1.2 }],
    home: { level: 'villa', w: 14, d: 10, door: 'almadies:home:villa', floor: 'marble' } },
  { id: 'residence_ngor', kind: 'home', name: 'Résidence de luxe · Pointe de Ngor', what: 'Un étage entier face à l’île de Ngor, terrasse et salon de réception', price: 2_500_000_000, rent: 600_000, income: letIncome(600_000), upkeep: 2_500,
    hub: 'almadies', place: 'residence', where: 'Almadies · Ngor', size: 1_200, tier: 5, upgrades: [{ id: 'domotique', name: 'Maison connectée', what: 'Lumières et clim pilotées : +20 énergie au réveil, loyer +25 %', price: 40_000_000, comfort: 20, rentMult: 1.25 }],
    home: { level: 'residence', w: 18, d: 12, door: 'almadies:home:residence', floor: 'marble' } },
];

// ------------------------------------------------------------------ land and billboards
export const LAND: AssetSpec[] = [
  { id: 'parcelle_150', kind: 'land', name: 'Parcelle de 150 m² · Cité Jàmm', what: 'Terrain nu derrière Keur Meubles : un maraîcher le loue en attendant que tu construises', price: 3_000_000, income: 4_500,
    hub: 'pikine', place: 'parcelle_150', where: 'Pikine · Cité Jàmm', size: 150, upgrades: [{ id: 'mur', name: 'Mur de clôture', what: 'Un mur en parpaings et un portail : loyer +25 %', price: 900_000, rentMult: 1.25 }] },
  { id: 'parcelle_300', kind: 'land', name: 'Parcelle de 300 m² · Cité Jàmm', what: 'Grand terrain d’angle derrière la Résidence Jàmm, loué comme parking en attendant', price: 7_500_000, income: 10_500,
    hub: 'pikine', place: 'parcelle_300', where: 'Pikine · Cité Jàmm', size: 300, upgrades: [{ id: 'mur', name: 'Mur de clôture', what: 'Un mur en parpaings et un portail : loyer +25 %', price: 1_500_000, rentMult: 1.25 }] },
];
export const BILLBOARDS: AssetSpec[] = [
  { id: 'panneau_jamm', kind: 'billboard', name: 'Panneau 4 × 3 · carrefour de la Cité Jàmm', what: 'Face à la grand-rue de Pikine : des milliers de passants chaque jour', price: 5_000_000, income: 12_000, wear: 3,
    hub: 'pikine', place: 'panneau_jamm', where: 'Pikine · Cité Jàmm', size: 12, upgrades: [{ id: 'eclairage', name: 'Éclairage de nuit', what: 'Projecteurs : on le voit aussi la nuit, loyer +30 %', price: 1_200_000, rentMult: 1.3 }] },
];

// ------------------------------------------------------------------ ventures (« Affaires », src/economy/business.ts)
export interface Venture { id: string; name: string; what: string }
export const VENTURES: Venture[] = [
  { id: 'bana', name: 'Table de bana-bana', what: 'Arachides, cartes de recharge et petites choses, au coin de la rue' },
  { id: 'kiosque', name: 'Kiosque', what: 'Crédit téléphonique, café Touba et journaux' },
  { id: 'boutique', name: 'Boutique de quartier', what: 'Riz, huile, sucre, pain : le quartier passe chez toi' },
  { id: 'car_rapide', name: 'Car rapide', what: 'Une ligne, un chauffeur et un apprenti' },
  { id: 'restaurant', name: 'Restaurant', what: 'De la gargote à la grande salle : ceebu jën tous les midis' },
  { id: 'immeuble', name: 'Immeuble de rapport', what: 'Des appartements loués en ville' },
  { id: 'entreprise', name: 'Grande entreprise', what: 'Import-export, transport et chantiers (fictive)' },
];
export const BUSINESSES: AssetSpec[] = VENTURES.map((v, i) => {
  const t = ECONOMY.business.tiers.find(x => x.id === v.id)!;
  return { id: v.id, kind: 'business', name: v.name, what: v.what, price: t.price, income: t.perHour, tier: i + 1 };
});

// ------------------------------------------------------------------ vehicles and aircraft: in the model, playable later
const DRIVE_SOON = 'Arrive avec la conduite (transports, vague 2)';
export const VEHICLES: AssetSpec[] = [
  // drivable (src/transport/ownedModule.ts): sold at a dealer corner of their hub (or here), delivered at its kerb
  { id: 'jakarta', kind: 'vehicle', name: 'Moto Jakarta', what: 'D’occasion · la moto des livreurs et des clandos à deux roues', price: 150_000, tier: 1, where: 'Garage Modou · Pikine' },
  { id: 'clando', kind: 'vehicle', name: 'Voiture d’occasion', what: 'Une berline fatiguée mais fidèle, idéale pour faire le clando', price: 2_800_000, tier: 2, where: 'Ndiaye Auto · Plateau' },
  { id: 'berline', kind: 'vehicle', name: 'Berline neuve', what: 'Climatisée, sièges en cuir', price: 14_000_000, tier: 3, soon: DRIVE_SOON },
  { id: 'camion', kind: 'vehicle', name: 'Camion de livraison', what: 'Pour une affaire de transport', price: 32_000_000, tier: 3, soon: DRIVE_SOON },
  { id: 'tout_terrain', kind: 'vehicle', name: '4 × 4 de luxe', what: 'Le grand véhicule des belles occasions', price: 75_000_000, tier: 4, soon: DRIVE_SOON },
];
export const AIRCRAFT: AssetSpec[] = [
  { id: 'jet', kind: 'aircraft', name: 'Jet privé', what: 'Pour les plus fortunés de Dakar', price: 12_000_000_000, tier: 5, soon: 'Arrive avec l’aéroport (vague 3)' },
];

// ------------------------------------------------------------------ furniture: basic / better / premium
export type Grade = 'basic' | 'better' | 'premium';
export const GRADE_LABEL: Record<Grade, string> = { basic: 'Simple', better: 'Confort', premium: 'Prestige' };
export type FurnitureType = 'chair' | 'sofa' | 'bed' | 'table' | 'tv' | 'radio' | 'rug' | 'mirror' | 'plant' | 'lamp' | 'wardrobe' | 'mattress' | 'desk' | 'kitchen';
export const TYPE_LABEL: Record<FurnitureType, string> = {
  chair: 'Chaises et fauteuils', sofa: 'Canapés', bed: 'Lits', table: 'Tables', tv: 'Télés', radio: 'Musique', rug: 'Tapis', mirror: 'Miroirs',
  plant: 'Plantes', lamp: 'Lampes', wardrobe: 'Rangements', mattress: 'Literie', desk: 'Bureaux', kitchen: 'Cuisine',
};
export interface FurnitureSeat { x: number; z: number; top: number; yaw: number; kind: SeatKind }
export interface FurnitureUse {
  id: string; label: string; seconds: number; needs: Partial<Needs>; counter?: string;
  /** Paid at the start (the ingredients of a meal cooked at home). */
  price?: number;
  /** Earned at the end (work at a desk), at most once per in-game hour of play (src/economy/estate.ts). */
  pay?: number;
  /** The player sits on the piece's first seat for it (resting on a sofa). */
  sit?: boolean;
  /** Where the player stands to use it, from the piece's centre, before rotation (default: 0.8 m in front). */
  spot?: [number, number];
}
export interface FurnitureSpec extends AssetSpec {
  kind: 'furniture';
  type: FurnitureType;
  grade: Grade;
  emoji: string;
  /** Footprint (m) facing +z (quarter turn 0): width along x, depth along z. */
  w: number; d: number;
  /** Lies flat on the floor (rugs): other pieces may stand on it. */
  flat?: boolean;
  /** Seats, from the piece's centre, before rotation (yaw 0 = the sitter faces +z). */
  seats?: FurnitureSeat[];
  /** What the player can do with it (an activity of the home). Beds sleep instead. */
  use?: FurnitureUse;
  /** Beds: energy restored by a night (the « sleep » activity). */
  sleep?: number;
  /** One per player (the starter pieces of the quincaillerie, kept from the first economy lane). */
  unique?: boolean;
  /** Not placed: improves the home's own bed (the « bon matelas »). */
  fixed?: 'bed';
  /** Where it is sold: the quincaillerie stall (Pikine), Keur Meubles (Cité Jàmm) or both. */
  shop: 'quincaillerie' | 'keur_meubles' | 'both';
}

const F = (x: Omit<FurnitureSpec, 'kind' | 'shop'> & { shop?: FurnitureSpec['shop'] }): FurnitureSpec => ({ shop: 'keur_meubles', ...x, kind: 'furniture' });
const chairSeat = (top: number): FurnitureSeat[] => [{ x: 0, z: 0.04, top, yaw: 0, kind: 'chair' }];
const sofaSeats = (n: number, len: number, top: number): FurnitureSeat[] =>
  Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 0 : (i / (n - 1) - 0.5) * (len - 0.7), z: 0.08, top, yaw: 0, kind: 'sofa' as SeatKind }));
const bedSeat = (w: number, top: number): FurnitureSeat[] => [{ x: w / 2 - 0.3, z: 0.1, top, yaw: Math.PI / 2, kind: 'bed' }];
const L = ECONOMY.furniture;
/** The starter pieces (first economy lane): same ids, prices and effects, sold at the quincaillerie and at Keur Meubles. */
export const STARTER_FURNITURE = ['miroir', 'tapis', 'chaises', 'radio', 'matelas', 'tele'];
export const FURNITURE_SPECS: FurnitureSpec[] = [
  // starter pieces (unique), the basic grade of their type
  F({ id: 'miroir', type: 'mirror', grade: 'basic', emoji: '🪞', name: 'Grand miroir', what: '« Se préparer » : hygiène et moral', price: L.miroir, w: 0.65, d: 0.1, unique: true, shop: 'both',
    use: { id: 'preparer', label: 'Se préparer', seconds: 2, needs: { hygiene: 12, moral: 6 }, counter: 'preparer', spot: [0, 0.7] } }),
  F({ id: 'tapis', type: 'rug', grade: 'basic', emoji: '🟥', name: 'Tapis', what: '« Se poser sur le tapis » : un peu d’énergie et de moral', price: L.tapis, w: 1.6, d: 1.1, flat: true, unique: true, shop: 'both',
    use: { id: 'tapis', label: 'Se poser sur le tapis', seconds: 3, needs: { energie: 6, moral: 5 }, spot: [0, 0] } }),
  F({ id: 'chaises', type: 'chair', grade: 'basic', emoji: '🪑', name: 'Deux chaises en plastique', what: 'Pour recevoir des amis', price: L.chaises, w: 1.1, d: 0.5, unique: true, shop: 'both',
    seats: [{ x: -0.29, z: 0.04, top: 0.53, yaw: 0, kind: 'chair' }, { x: 0.29, z: 0.04, top: 0.53, yaw: 0, kind: 'chair' }] }),
  F({ id: 'radio', type: 'radio', grade: 'basic', emoji: '📻', name: 'Petite radio', what: '« Écouter la radio » : moral (aucune vraie station)', price: L.radio, w: 0.6, d: 0.35, unique: true, shop: 'both',
    use: { id: 'radio', label: 'Écouter la radio', seconds: 3, needs: { moral: 10, social: 3 }, counter: 'radio', spot: [0, 0.6] } }),
  F({ id: 'matelas', type: 'mattress', grade: 'better', emoji: '🛏️', name: 'Bon matelas', what: 'Le sommeil dans ton lit rend plus d’énergie et de moral', price: L.matelas, w: 1.4, d: 1.95, fixed: 'bed', unique: true, shop: 'both' }),
  F({ id: 'tele', type: 'tv', grade: 'basic', emoji: '📺', name: 'Petite télé', what: '« Regarder la télé » : moral (programmes imaginaires)', price: L.tele, w: 0.7, d: 0.4, unique: true, shop: 'both',
    use: { id: 'tele', label: 'Regarder la télé', seconds: 4, needs: { moral: 9, energie: 3, faim: -2 }, counter: 'tele', spot: [0, 1.2] } }),
  // chairs and armchairs
  F({ id: 'chaise_plastique', type: 'chair', grade: 'basic', emoji: '🪑', name: 'Chaise en plastique', what: 'Une chaise de plus pour les visites', price: 1_800, w: 0.5, d: 0.5, seats: chairSeat(0.53) }),
  F({ id: 'chaise_bois', type: 'chair', grade: 'better', emoji: '🪑', name: 'Chaise en bois sculpté', what: 'Bois massif travaillé à la main', price: 12_000, w: 0.5, d: 0.5, seats: chairSeat(0.5) }),
  F({ id: 'fauteuil_cuir', type: 'chair', grade: 'premium', emoji: '💺', name: 'Fauteuil en cuir', what: 'Large, profond, cuir cognac', price: 85_000, w: 0.85, d: 0.8, seats: chairSeat(0.46) }),
  // sofas
  F({ id: 'banquette', type: 'sofa', grade: 'basic', emoji: '🛋️', name: 'Banquette en bois', what: 'Deux places et des coussins en wax : « Se détendre »', price: 18_000, w: 1.6, d: 0.6, seats: sofaSeats(2, 1.6, 0.48),
    use: { id: 'detente', label: 'Se détendre', seconds: 4, needs: { energie: 6, moral: 6 }, sit: true } }),
  F({ id: 'canape_wax', type: 'sofa', grade: 'better', emoji: '🛋️', name: 'Canapé en tissu wax', what: 'Trois places, tissu aux motifs du marché : « Se détendre »', price: 95_000, w: 2.0, d: 0.85, seats: sofaSeats(3, 2.0, 0.46),
    use: { id: 'detente', label: 'Se détendre', seconds: 4, needs: { energie: 10, moral: 9 }, sit: true } }),
  F({ id: 'canape_cuir', type: 'sofa', grade: 'premium', emoji: '🛋️', name: 'Grand canapé en cuir', what: 'Trois places en cuir capitonné : « Se détendre »', price: 650_000, w: 2.6, d: 0.95, seats: sofaSeats(3, 2.6, 0.45),
    use: { id: 'detente', label: 'Se détendre', seconds: 4, needs: { energie: 14, moral: 14 }, sit: true } }),
  // beds (sleep)
  F({ id: 'matelas_sol', type: 'bed', grade: 'basic', emoji: '🛏️', name: 'Matelas au sol', what: 'Une mousse et un drap en wax : on dort, c’est déjà ça', price: 9_000, w: 1.0, d: 2.0, sleep: 55, seats: bedSeat(1.0, 0.24) }),
  F({ id: 'lit_bois', type: 'bed', grade: 'better', emoji: '🛏️', name: 'Lit en bois, deux places', what: 'Cadre en bois et bon matelas', price: 120_000, w: 1.5, d: 2.1, sleep: 80, seats: bedSeat(1.5, 0.58) }),
  F({ id: 'lit_king', type: 'bed', grade: 'premium', emoji: '🛏️', name: 'Grand lit capitonné', what: 'Tête de lit capitonnée, draps de coton', price: 900_000, w: 1.9, d: 2.2, sleep: 100, seats: bedSeat(1.9, 0.62) }),
  // tables (ataya)
  F({ id: 'table_basse', type: 'table', grade: 'basic', emoji: '🫖', name: 'Table basse', what: '« Préparer l’ataya » : le thé entre amis', price: 6_000, w: 0.9, d: 0.5,
    use: { id: 'ataya', label: 'Préparer l’ataya', seconds: 5, needs: { moral: 6, social: 3 }, counter: 'ataya' } }),
  F({ id: 'table_manger', type: 'table', grade: 'better', emoji: '🍽️', name: 'Table à manger', what: 'Six couverts : « Préparer l’ataya »', price: 60_000, w: 1.4, d: 0.8,
    use: { id: 'ataya', label: 'Préparer l’ataya', seconds: 5, needs: { moral: 8, social: 4 }, counter: 'ataya' } }),
  F({ id: 'table_marbre', type: 'table', grade: 'premium', emoji: '🍽️', name: 'Table en marbre', what: 'Plateau de marbre blanc : « Préparer l’ataya »', price: 450_000, w: 1.8, d: 0.9,
    use: { id: 'ataya', label: 'Préparer l’ataya', seconds: 5, needs: { moral: 10, social: 5 }, counter: 'ataya' } }),
  // televisions
  F({ id: 'tele_plate', type: 'tv', grade: 'better', emoji: '📺', name: 'Télé écran plat', what: 'Sur son meuble : « Regarder la télé »', price: 180_000, w: 1.2, d: 0.45,
    use: { id: 'tele', label: 'Regarder la télé', seconds: 4, needs: { moral: 14, energie: 3 }, counter: 'tele', spot: [0, 1.5] } }),
  F({ id: 'home_cinema', type: 'tv', grade: 'premium', emoji: '🎬', name: 'Home cinéma', what: 'Grand écran et enceintes : la lutte comme à l’arène', price: 1_500_000, w: 2.0, d: 0.5,
    use: { id: 'tele', label: 'Regarder un film', seconds: 5, needs: { moral: 20, energie: 4, social: 2 }, counter: 'tele', spot: [0, 1.8] } }),
  // music
  F({ id: 'chaine_hifi', type: 'radio', grade: 'better', emoji: '🎶', name: 'Chaîne hi-fi', what: '« Écouter de la musique » : moral', price: 75_000, w: 0.9, d: 0.4,
    use: { id: 'musique', label: 'Écouter de la musique', seconds: 3, needs: { moral: 14, social: 2 }, counter: 'radio' } }),
  F({ id: 'enceintes', type: 'radio', grade: 'premium', emoji: '🔊', name: 'Enceintes de salon', what: 'Le son d’une salle de concert', price: 400_000, w: 1.4, d: 0.45,
    use: { id: 'musique', label: 'Écouter de la musique', seconds: 3, needs: { moral: 20, social: 4 }, counter: 'radio' } }),
  // rugs (flat)
  F({ id: 'tapis_tisse', type: 'rug', grade: 'better', emoji: '🟫', name: 'Tapis tissé', what: 'Laine tissée à la main', price: 35_000, w: 2.0, d: 1.4, flat: true,
    use: { id: 'tapis', label: 'Se poser sur le tapis', seconds: 3, needs: { energie: 8, moral: 7 }, spot: [0, 0] } }),
  F({ id: 'tapis_soie', type: 'rug', grade: 'premium', emoji: '🟪', name: 'Grand tapis de soie', what: 'Soie et fils d’or', price: 280_000, w: 2.6, d: 1.8, flat: true,
    use: { id: 'tapis', label: 'Se poser sur le tapis', seconds: 3, needs: { energie: 10, moral: 10 }, spot: [0, 0] } }),
  // mirrors
  F({ id: 'coiffeuse', type: 'mirror', grade: 'better', emoji: '🪞', name: 'Coiffeuse avec miroir', what: '« Se préparer » assis, avec tiroirs', price: 55_000, w: 1.0, d: 0.45,
    use: { id: 'preparer', label: 'Se préparer', seconds: 2, needs: { hygiene: 16, moral: 8 }, counter: 'preparer' } }),
  F({ id: 'miroir_dore', type: 'mirror', grade: 'premium', emoji: '🪞', name: 'Miroir doré en pied', what: 'Cadre doré, éclairage intégré', price: 350_000, w: 0.9, d: 0.15,
    use: { id: 'preparer', label: 'Se préparer', seconds: 2, needs: { hygiene: 20, moral: 12 }, counter: 'preparer', spot: [0, 0.8] } }),
  // plants
  F({ id: 'plante', type: 'plant', grade: 'basic', emoji: '🪴', name: 'Plante en pot', what: '« Arroser la plante » : un peu de calme', price: 2_000, w: 0.4, d: 0.4,
    use: { id: 'arroser', label: 'Arroser la plante', seconds: 2, needs: { moral: 3 }, spot: [0, 0.6] } }),
  F({ id: 'palmier', type: 'plant', grade: 'better', emoji: '🌴', name: 'Palmier d’intérieur', what: 'Un grand palmier en pot', price: 15_000, w: 0.6, d: 0.6,
    use: { id: 'arroser', label: 'Arroser la plante', seconds: 2, needs: { moral: 4 }, spot: [0, 0.7] } }),
  F({ id: 'jardiniere', type: 'plant', grade: 'premium', emoji: '🌺', name: 'Jardinière sculptée', what: 'Bougainvilliers dans un bac en bois sculpté', price: 90_000, w: 1.0, d: 0.4,
    use: { id: 'arroser', label: 'Arroser les fleurs', seconds: 2, needs: { moral: 6 }, spot: [0, 0.7] } }),
  // desks: a little work from home, once per in-game hour (and the ventures at hand)
  F({ id: 'bureau_simple', type: 'desk', grade: 'basic', emoji: '🗂️', name: 'Petit bureau et sa chaise', what: '« Travailler au bureau » : petits travaux, +600 F une fois par heure en ville', price: 15_000, w: 1.1, d: 1.1,
    seats: [{ x: 0, z: 0.3, top: 0.53, yaw: Math.PI, kind: 'chair' }], use: { id: 'bureau', label: 'Travailler au bureau', seconds: 6, needs: { energie: -6 }, pay: 600, sit: true, spot: [0, 0.85] } }),
  F({ id: 'bureau_bois', type: 'desk', grade: 'better', emoji: '💻', name: 'Bureau en bois avec ordinateur', what: '« Travailler au bureau » : +1 500 F une fois par heure en ville', price: 140_000, w: 1.4, d: 1.2,
    seats: [{ x: 0, z: 0.32, top: 0.53, yaw: Math.PI, kind: 'chair' }], use: { id: 'bureau', label: 'Travailler au bureau', seconds: 6, needs: { energie: -6 }, pay: 1_500, sit: true, spot: [0, 0.9] } }),
  F({ id: 'bureau_direction', type: 'desk', grade: 'premium', emoji: '🖥️', name: 'Bureau de direction', what: 'Grand plateau, deux écrans : +4 000 F une fois par heure en ville', price: 900_000, w: 1.9, d: 1.4,
    seats: [{ x: 0, z: 0.38, top: 0.46, yaw: Math.PI, kind: 'chair' }], use: { id: 'bureau', label: 'Travailler au bureau', seconds: 6, needs: { energie: -5, moral: 3 }, pay: 4_000, sit: true, spot: [0, 1.0] } }),
  // kitchen: cook at home (the ingredients cost less than a gargote meal)
  F({ id: 'rechaud', type: 'kitchen', grade: 'basic', emoji: '🔥', name: 'Réchaud à gaz et marmite', what: '« Cuisiner un repas » : 400 F d’ingrédients, faim +40', price: 7_500, w: 0.8, d: 0.5,
    use: { id: 'cuisiner', label: 'Cuisiner un repas', seconds: 6, needs: { faim: 40, moral: 3 }, counter: 'meals', price: 400 } }),
  F({ id: 'cuisiniere', type: 'kitchen', grade: 'better', emoji: '🍳', name: 'Cuisinière et plan de travail', what: '« Cuisiner un repas » : 500 F, faim +55, moral +6', price: 95_000, w: 1.6, d: 0.6,
    use: { id: 'cuisiner', label: 'Cuisiner un repas', seconds: 6, needs: { faim: 55, moral: 6 }, counter: 'meals', price: 500 } }),
  F({ id: 'cuisine_equipee', type: 'kitchen', grade: 'premium', emoji: '🍲', name: 'Cuisine équipée', what: 'Îlot, four et frigo : 600 F, faim +70, moral +10', price: 750_000, w: 2.4, d: 0.9,
    use: { id: 'cuisiner', label: 'Cuisiner un repas', seconds: 6, needs: { faim: 70, moral: 10 }, counter: 'meals', price: 600 } }),
  // lamps (light at night)
  F({ id: 'lampe', type: 'lamp', grade: 'basic', emoji: '💡', name: 'Petite lampe', what: 'Une lumière douce le soir', price: 3_500, w: 0.35, d: 0.35 }),
  F({ id: 'lampadaire', type: 'lamp', grade: 'better', emoji: '🪔', name: 'Lampadaire', what: 'Abat-jour en tissu, lumière chaude', price: 28_000, w: 0.45, d: 0.45 }),
  F({ id: 'lampadaire_laiton', type: 'lamp', grade: 'premium', emoji: '🏮', name: 'Lampadaire en laiton', what: 'Laiton martelé par un artisan de Soumbédioune', price: 300_000, w: 0.6, d: 0.6 }),
  // wardrobes
  F({ id: 'armoire_metal', type: 'wardrobe', grade: 'basic', emoji: '🗄️', name: 'Armoire en métal', what: '« Se changer » : hygiène et moral', price: 25_000, w: 1.0, d: 0.55,
    use: { id: 'changer', label: 'Se changer', seconds: 2, needs: { hygiene: 6, moral: 4 } } }),
  F({ id: 'armoire_bois', type: 'wardrobe', grade: 'better', emoji: '🚪', name: 'Armoire en bois', what: 'Deux portes, bois verni', price: 110_000, w: 1.4, d: 0.6,
    use: { id: 'changer', label: 'Se changer', seconds: 2, needs: { hygiene: 8, moral: 6 } } }),
  F({ id: 'dressing', type: 'wardrobe', grade: 'premium', emoji: '👔', name: 'Dressing', what: 'Penderies, tiroirs et miroirs', price: 800_000, w: 2.2, d: 0.65,
    use: { id: 'changer', label: 'Se changer', seconds: 2, needs: { hygiene: 10, moral: 10 } } }),
];

export const ASSET_SPECS: AssetSpec[] = [...HOMES, ...LAND, ...BILLBOARDS, ...BUSINESSES, ...VEHICLES, ...AIRCRAFT, ...FURNITURE_SPECS];
const BY_ID = new Map(ASSET_SPECS.map(s => [s.id, s]));
export const specOf = (id: string): AssetSpec | undefined => BY_ID.get(id);
export const homeSpec = (id: string): HomeSpec | undefined => { const s = BY_ID.get(id); return s?.kind === 'home' ? s as HomeSpec : undefined; };
export const furnitureSpec = (id: string): FurnitureSpec | undefined => { const s = BY_ID.get(id); return s?.kind === 'furniture' ? s as FurnitureSpec : undefined; };
/** The home whose street door is `doorId`. */
export const homeByDoor = (doorId: string) => HOMES.find(h => h.home.door === doorId);
