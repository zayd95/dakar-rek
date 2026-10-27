import type { HubId, Needs } from '../core/types';
import type { SeatKind } from '../interact/seats';
import type { RoomKind } from '../housing/plan';
import { STARTER_HOME } from '../core/save';
import { ECONOMY } from './config';

/**
 * The catalogue of everything a player can own or rent (docs/OWNERSHIP.md): what each thing is, where it is, what it
 * costs and brings. Pure data, separate from the save state (src/core/types.ts AssetState) and from the logic
 * (src/economy/assets.ts). These are the game's own prices: the economy is virtual and uncapped (Habib, 9 Oct 2026),
 * so the ladders climb to hundreds of millions and billions. Every name, brand and place here is fictional.
 */
export type AssetKind = 'home' | 'land' | 'billboard' | 'vehicle' | 'business' | 'furniture' | 'aircraft' | 'wear';
export const KIND_LABEL: Record<AssetKind, string> = {
  home: 'Logement', land: 'Terrain', billboard: 'Panneau publicitaire', vehicle: 'Véhicule', business: 'Affaire', furniture: 'Meuble', aircraft: 'Avion', wear: 'Couleurs de supporter',
};
export const KIND_ICON: Record<AssetKind, string> = { home: '🏠', land: '🟫', billboard: '🪧', vehicle: '🚗', business: '🏪', furniture: '🛋️', aircraft: '✈️', wear: '🧣' };

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
  { id: 'appart_jamm', kind: 'home', name: 'Appartement F2 · Résidence Jàmm', what: 'Entrée, séjour, cuisine, chambre et salle de bain, au premier étage', price: 15_000_000, rent: 6_000, income: letIncome(6_000),
    hub: 'pikine', place: 'jamm', where: 'Pikine · Cité Jàmm', size: 63, tier: 2, upgrades: COMFORT, home: { level: 'apartment', w: 9, d: 7, door: 'pikine:home:jamm', floor: 'tiles' } },
  { id: 'maison_cite', kind: 'home', name: 'Maison familiale · Cité Jàmm', what: 'Une maison avec cour, grand salon et cuisine, au bout de la cité', price: 150_000_000, rent: 30_000, income: letIncome(30_000), upkeep: 100,
    hub: 'pikine', place: 'maison', where: 'Pikine · Cité Jàmm', size: 216, tier: 3, upgrades: [...COMFORT, { id: 'clim', name: 'Climatisation', what: 'Fraîcheur toute l’année : +15 énergie au réveil, loyer +15 %', price: 650_000, comfort: 15, rentMult: 1.15 }],
    home: { level: 'house', w: 12, d: 9, door: 'pikine:home:maison', floor: 'marble' } },
  // LD2.0-D: the flagship villa, walked on its three levels (src/housing/villaPlan.ts): 288 m² on two storeys, the pool garden, two balconies, the roof terrace
  { id: 'villa_almadies', kind: 'home', name: 'Villa avec piscine · Almadies', what: 'Deux étages, grand salon ouvert sur la piscine, suite parentale, toit-terrasse avec hélipad', price: 400_000_000, rent: 120_000, income: letIncome(120_000), upkeep: 500,
    hub: 'almadies', place: 'villa', where: 'Almadies', size: 288, tier: 4, upgrades: [{ id: 'clim', name: 'Climatisation', what: '+15 énergie au réveil, loyer +15 %', price: 2_500_000, comfort: 15, rentMult: 1.15 }, { id: 'jardin', name: 'Jardin paysager', what: 'Bougainvilliers et palmiers : loyer +20 %', price: 8_000_000, rentMult: 1.2 }],
    home: { level: 'villa', w: 16, d: 9, door: 'almadies:home:villa', floor: 'marble' } },
  { id: 'residence_ngor', kind: 'home', name: 'Résidence de luxe · Pointe de Ngor', what: 'Un étage entier face à l’île de Ngor, terrasse et salon de réception', price: 2_500_000_000, rent: 600_000, income: letIncome(600_000), upkeep: 2_500,
    hub: 'almadies', place: 'residence', where: 'Almadies · Ngor', size: 330, tier: 5, upgrades: [{ id: 'domotique', name: 'Maison connectée', what: 'Lumières et clim pilotées : +20 énergie au réveil, loyer +25 %', price: 40_000_000, comfort: 20, rentMult: 1.25 }],
    home: { level: 'residence', w: 22, d: 15, door: 'almadies:home:residence', floor: 'marble' } },
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
  // the modern sedan (Stage A of the player-owned lineup, docs/assets/VEHICLE_LINEUP.md). The price is a PROVISIONAL placeholder: the economy balance pass sets it (it is not the old car's)
  // the player cars with a body of their own (src/transport/modelCars.ts; original designs, the game's names): prices PROVISIONAL like the others
  { id: 'teranga', kind: 'vehicle', name: 'Teranga', what: 'Citadine moderne, toit noir : la première voiture du quartier, parfaite pour les courses VTC', price: 4_000_000, tier: 2, where: 'Sarr Auto · Pikine' },
  { id: 'rafet', kind: 'vehicle', name: 'Rafet', what: 'Citadine sportive, jaune ou blanche : vive et soignée', price: 5_500_000, tier: 2, where: 'Ndiaye Auto · Plateau' },
  { id: 'compacte', kind: 'vehicle', name: 'Berline moderne', what: 'Moderne et soignée, quatre portes : la grande sœur des citadines', price: 6_000_000, tier: 2, where: 'Ndiaye Auto · Plateau' },
  // PROVISIONAL: the kit's bodies until Stages B and C of the lineup give them bodies worth their prices (prices and handling wait for the economy pass)
  { id: 'berline', kind: 'vehicle', name: 'Berline neuve', what: 'Climatisée, sièges en cuir · modèle provisoire', price: 14_000_000, tier: 3, where: 'Prestige Auto · Almadies' },
  { id: 'camion', kind: 'vehicle', name: 'Camion de livraison', what: 'Pour une affaire de transport', price: 32_000_000, tier: 3, soon: DRIVE_SOON },
  // the luxury SUV (`tout_terrain` kept its id: every owner keeps their car, now in its own body) and the SUV coupé
  { id: 'gainde', kind: 'vehicle', name: 'Gaïndé', what: 'SUV coupé : le toit qui plonge, la présence d’un grand', price: 65_000_000, tier: 4, where: 'Prestige Auto · Almadies' },
  { id: 'tout_terrain', kind: 'vehicle', name: 'Lamane Sport', what: 'Le grand SUV de luxe, toit noir flottant : le vaisseau amiral de Prestige', price: 70_000_000, tier: 4, where: 'Prestige Auto · Almadies' },
];
export const AIRCRAFT: AssetSpec[] = [
  { id: 'jet', kind: 'aircraft', name: 'Jet privé', what: 'Pour les plus fortunés de Dakar', price: 12_000_000_000, tier: 5, soon: 'Arrive avec l’aéroport (vague 3)' },
];

// ------------------------------------------------------------------ furniture: basic / better / premium
export type Grade = 'basic' | 'better' | 'premium';
export const GRADE_LABEL: Record<Grade, string> = { basic: 'Simple', better: 'Confort', premium: 'Prestige' };
export type FurnitureType = 'chair' | 'sofa' | 'bed' | 'table' | 'tv' | 'radio' | 'rug' | 'mirror' | 'plant' | 'lamp' | 'wardrobe' | 'mattress' | 'desk' | 'kitchen'
  | 'dining' | 'appliance' | 'bath' | 'decor' | 'shelf' | 'outdoor';
export const TYPE_LABEL: Record<FurnitureType, string> = {
  chair: 'Chaises et fauteuils', sofa: 'Canapés', bed: 'Lits', table: 'Tables', tv: 'Télés', radio: 'Musique', rug: 'Tapis', mirror: 'Miroirs',
  plant: 'Plantes', lamp: 'Lampes', wardrobe: 'Rangements', mattress: 'Literie', desk: 'Bureaux', kitchen: 'Cuisine',
  dining: 'Salles à manger', appliance: 'Électroménager', bath: 'Salle de bain', decor: 'Déco et objets', shelf: 'Bibliothèques', outdoor: 'Jardin et piscine',
};
/** A place on a piece: `top` is the surface height; `clip` the pose held there (default Sit; beds: Lie, along the bed; floor cushions: SitFloor, cross-legged). */
export interface FurnitureSeat { x: number; z: number; top: number; yaw: number; kind: SeatKind; clip?: 'Lie' | 'SitFloor' }
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
  /**
   * The room it goes to first in a home built from a floor plan (src/housing/plan.ts; src/economy/placement.ts autoPlace), when not its type's
   * (placement.ts TYPE_ROOM). 'any': the séjour first, else wherever it fits. Not saved: a piece's room is where it stands.
   */
  room?: RoomKind | 'any';
  /**
   * Off the floor: hung on a wall (pictures, a bathroom mirror, a towel rail; its back flush with the wall) or from the ceiling (hanging lamps).
   * It takes no floor space: floor pieces stand under it and people walk under it; it only avoids other pieces hung the same way.
   */
  mount?: 'wall' | 'ceiling';
  /** A furniture line the catalogue shows as its own collection: 'almadies', the modern-luxury « Collection Almadies » (LD2.0-D, lane K-L). */
  line?: 'almadies';
}

const F = (x: Omit<FurnitureSpec, 'kind' | 'shop'> & { shop?: FurnitureSpec['shop'] }): FurnitureSpec => ({ shop: 'keur_meubles', ...x, kind: 'furniture' });
const chairSeat = (top: number): FurnitureSeat[] => [{ x: 0, z: 0.04, top, yaw: 0, kind: 'chair' }];
const sofaSeats = (n: number, len: number, top: number): FurnitureSeat[] =>
  Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 0 : (i / (n - 1) - 0.5) * (len - 0.7), z: 0.08, top, yaw: 0, kind: 'sofa' as SeatKind }));
/** Lying along the bed: hips at the middle of the mattress, head on the pillow (−z), feet toward +z (`w` kept for the footprint). */
const bedSeat = (_w: number, top: number): FurnitureSeat[] => [{ x: 0, z: 0.02, top, yaw: 0, kind: 'bed', clip: 'Lie' }];
const PI = Math.PI;
/** Chairs of a set (a dining table's, a garden table's): [x, z, yaw] each, all at seat height `top`. */
const setOf = (spots: readonly (readonly [number, number, number])[], top: number, kind: SeatKind = 'chair'): FurnitureSeat[] => spots.map(([x, z, yaw]) => ({ x, z, top, yaw, kind }));
/** Four chairs round a table, `r` from its centre, each facing it. */
const ringOf = (r: number, top: number) => setOf([[0, -r, 0], [r, 0, -PI / 2], [0, r, PI], [-r, 0, PI / 2]], top);
const ataya = (moral: number, social: number): FurnitureUse => ({ id: 'ataya', label: 'Préparer l’ataya', seconds: 5, needs: { moral, social }, counter: 'ataya' });
const breakfast = (faim: number, moral: number, price: number): FurnitureUse => ({ id: 'petitdej', label: 'Prendre le petit-déjeuner', seconds: 4, needs: { faim, moral }, counter: 'meals', price, sit: true });
const reheat = (faim: number, moral: number, price: number): FurnitureUse => ({ id: 'rechauffer', label: 'Réchauffer un plat', seconds: 3, needs: moral ? { faim, moral } : { faim }, counter: 'meals', price });
const drink = (energie: number, moral: number): FurnitureUse => ({ id: 'boire', label: 'Boire de l’eau fraîche', seconds: 2, needs: { energie, moral } });
const fan = (energie: number, moral: number): FurnitureUse => ({ id: 'ventilo', label: 'Se mettre au ventilateur', seconds: 3, needs: { energie, moral } });
const freshen = (hygiene: number, moral: number): FurnitureUse => ({ id: 'rafraichir', label: 'Se rafraîchir', seconds: 2, needs: { hygiene, moral } });
const prepare = (hygiene: number, moral: number): FurnitureUse => ({ id: 'preparer', label: 'Se préparer', seconds: 2, needs: { hygiene, moral }, counter: 'preparer', spot: [0, 0.6] });
const change = (hygiene: number, moral: number): FurnitureUse => ({ id: 'changer', label: 'Se changer', seconds: 2, needs: { hygiene, moral } });
const lounge = (energie: number, moral: number): FurnitureUse => ({ id: 'detente', label: 'Se détendre', seconds: 4, needs: { energie, moral }, sit: true });
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
  F({ id: 'canape_cuir', type: 'sofa', grade: 'premium', emoji: '🛋️', name: 'Grand canapé en velours', what: 'Trois places en velours, cadre sculpté et doré : « Se détendre »', price: 650_000, w: 2.6, d: 0.95, seats: sofaSeats(3, 2.6, 0.45),
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
  // ---------------------------------------------------------------- LD2.0-C, the furnishing upgrade (docs/ld2/LD2_C.md): ids new and stable
  // dining sets: a table and its chairs (the séjour)
  F({ id: 'salle_manger_simple', type: 'dining', grade: 'basic', emoji: '🍽️', name: 'Table et quatre chaises', what: 'Table en bois, toile cirée et quatre chaises en plastique : « Préparer l’ataya »', price: 32_000, w: 1.12, d: 1.6,
    seats: setOf([[-0.28, -0.47, 0], [0.28, -0.47, 0], [-0.28, 0.47, PI], [0.28, 0.47, PI]], 0.55), use: ataya(7, 4) }),
  F({ id: 'salle_manger_bois', type: 'dining', grade: 'better', emoji: '🍽️', name: 'Salle à manger en bois', what: 'Table vernie et quatre chaises aux coussins en wax : « Préparer l’ataya »', price: 175_000, w: 1.42, d: 1.72,
    seats: setOf([[-0.36, -0.57, 0], [0.36, -0.57, 0], [-0.36, 0.57, PI], [0.36, 0.57, PI]], 0.64), use: ataya(9, 5) }),
  F({ id: 'salle_manger_marbre', type: 'dining', grade: 'premium', emoji: '🍽️', name: 'Salle à manger en marbre', what: 'Plateau de marbre sur pieds sculptés, six chaises de velours : « Préparer l’ataya »', price: 1_250_000, w: 1.92, d: 1.92,
    seats: setOf([[-0.62, -0.63, 0], [0, -0.63, 0], [0.62, -0.63, 0], [-0.62, 0.63, PI], [0, 0.63, PI], [0.62, 0.63, PI]], 0.62), use: ataya(12, 6) }),
  // kitchen: a table and its stools, cookers (the cuisine; the F2's own counter, sink, stove and fridge are built in)
  F({ id: 'table_cuisine', type: 'kitchen', grade: 'basic', emoji: '🥖', name: 'Table de cuisine et tabourets', what: 'Formica et deux tabourets : « Prendre le petit-déjeuner » (250 F, faim +20)', price: 16_000, w: 0.82, d: 0.96,
    seats: setOf([[-0.2, 0.28, PI], [0.2, 0.28, PI]], 0.57, 'stool'), use: breakfast(20, 3, 250) }),
  F({ id: 'table_cuisine_bois', type: 'kitchen', grade: 'better', emoji: '🥖', name: 'Table de cuisine en bois', what: 'Bois verni, un tiroir, deux tabourets cannés : « Prendre le petit-déjeuner » (300 F, faim +25)', price: 55_000, w: 1.0, d: 1.0,
    seats: setOf([[-0.24, 0.31, PI], [0.24, 0.31, PI]], 0.58, 'stool'), use: breakfast(25, 4, 300) }),
  F({ id: 'bar_cuisine', type: 'kitchen', grade: 'premium', emoji: '☕', name: 'Bar de cuisine et tabourets hauts', what: 'Plateau de marbre, tabourets chromés, machine à café : « Prendre le petit-déjeuner »', price: 260_000, w: 1.12, d: 1.0,
    seats: setOf([[-0.27, 0.28, PI], [0.27, 0.28, PI]], 0.87, 'stool'), use: breakfast(30, 6, 350) }),
  F({ id: 'gaziniere', type: 'kitchen', grade: 'better', emoji: '🍳', name: 'Cuisinière à gaz quatre feux', what: 'Four et quatre feux : « Cuisiner un repas » (500 F, faim +55)', price: 145_000, w: 0.6, d: 0.66,
    use: { id: 'cuisiner', label: 'Cuisiner un repas', seconds: 6, needs: { faim: 55, moral: 6 }, counter: 'meals', price: 500 } }),
  F({ id: 'piano_cuisson', type: 'kitchen', grade: 'premium', emoji: '🍲', name: 'Piano de cuisson et sa hotte', what: 'Cinq feux, deux fours, hotte inox : « Cuisiner un repas » (600 F, faim +70)', price: 980_000, w: 0.92, d: 0.66,
    use: { id: 'cuisiner', label: 'Cuisiner un repas', seconds: 6, needs: { faim: 70, moral: 10 }, counter: 'meals', price: 600 } }),
  // appliances: microwaves, water, fans
  F({ id: 'micro_ondes_desserte', type: 'appliance', grade: 'basic', emoji: '♨️', name: 'Micro-ondes sur desserte', what: 'Sur sa desserte à roulettes : « Réchauffer un plat » (300 F, faim +30)', price: 45_000, w: 0.56, d: 0.42, use: reheat(30, 0, 300) }),
  F({ id: 'micro_ondes', type: 'appliance', grade: 'better', emoji: '♨️', name: 'Micro-ondes sur meuble', what: 'Sur un meuble en bois à deux portes : « Réchauffer un plat » (300 F, faim +35)', price: 95_000, w: 0.62, d: 0.5, use: reheat(35, 2, 300) }),
  F({ id: 'colonne_four', type: 'appliance', grade: 'premium', emoji: '♨️', name: 'Colonne four et micro-ondes', what: 'Four, micro-ondes, tiroirs et placard : « Réchauffer un plat » (350 F, faim +45)', price: 520_000, w: 0.62, d: 0.62, use: reheat(45, 5, 350) }),
  F({ id: 'canari', type: 'appliance', grade: 'basic', emoji: '🏺', name: 'Canari et son support', what: 'L’eau reste fraîche dans la terre cuite : « Boire de l’eau fraîche »', price: 5_500, w: 0.4, d: 0.4, use: drink(3, 3) }),
  F({ id: 'fontaine_eau', type: 'appliance', grade: 'better', emoji: '🚰', name: 'Fontaine à eau', what: 'Eau fraîche et eau chaude, sa bonbonne : « Boire de l’eau fraîche »', price: 65_000, w: 0.32, d: 0.38, use: drink(4, 4) }),
  F({ id: 'fontaine_inox', type: 'appliance', grade: 'premium', emoji: '🚰', name: 'Fontaine inox', what: 'Inox, trois robinets, bonbonne cachée : « Boire de l’eau fraîche »', price: 280_000, w: 0.34, d: 0.4, use: drink(5, 6) }),
  F({ id: 'ventilateur', type: 'appliance', grade: 'basic', emoji: '🌀', name: 'Petit ventilateur', what: '« Se mettre au ventilateur » : un peu de fraîcheur', price: 7_500, w: 0.32, d: 0.28, room: 'chambre', use: fan(3, 3) }),
  F({ id: 'ventilo_pied', type: 'appliance', grade: 'better', emoji: '🌀', name: 'Ventilateur sur pied', what: 'Grand, sur pied : « Se mettre au ventilateur »', price: 22_000, w: 0.5, d: 0.5, room: 'chambre', use: fan(5, 4) }),
  F({ id: 'ventilo_colonne', type: 'appliance', grade: 'premium', emoji: '🌀', name: 'Ventilateur colonne', what: 'Colonne silencieuse et télécommande : « Se mettre au ventilateur »', price: 95_000, w: 0.4, d: 0.4, room: 'chambre', use: fan(7, 6) }),
  // bathroom (the salle de bain; the F2's shower, WC and basin are built in): basins, mirrors and towel rails on the wall
  F({ id: 'lavabo_colonne', type: 'bath', grade: 'basic', emoji: '🚿', name: 'Lavabo sur colonne', what: 'Un lavabo de plus : « Se rafraîchir »', price: 25_000, w: 0.56, d: 0.44, use: freshen(12, 2) }),
  F({ id: 'meuble_vasque', type: 'bath', grade: 'better', emoji: '🚿', name: 'Meuble vasque en bois', what: 'Vasque, robinet mitigeur et rangements : « Se rafraîchir »', price: 130_000, w: 0.72, d: 0.48, use: freshen(16, 4) }),
  F({ id: 'vasque_marbre', type: 'bath', grade: 'premium', emoji: '🚿', name: 'Double vasque en marbre', what: 'Deux vasques sur marbre, meuble suspendu en noyer : « Se rafraîchir »', price: 720_000, w: 1.22, d: 0.54, use: freshen(20, 6) }),
  F({ id: 'miroir_sdb', type: 'bath', grade: 'basic', emoji: '🪞', name: 'Miroir rond', what: 'Cadre en rotin, accroché au mur : « Se préparer »', price: 4_500, w: 0.52, d: 0.06, mount: 'wall', use: prepare(8, 4) }),
  F({ id: 'armoire_toilette', type: 'bath', grade: 'better', emoji: '🪞', name: 'Armoire de toilette', what: 'Porte miroir, éclairage et tablette, au mur : « Se préparer »', price: 45_000, w: 0.6, d: 0.15, mount: 'wall', use: prepare(12, 6) }),
  F({ id: 'miroir_lumineux', type: 'bath', grade: 'premium', emoji: '🪞', name: 'Miroir lumineux', what: 'Grand miroir éclairé et tablette en verre, au mur : « Se préparer »', price: 220_000, w: 0.92, d: 0.14, mount: 'wall', use: prepare(16, 10) }),
  F({ id: 'porte_serviettes', type: 'bath', grade: 'basic', emoji: '🧺', name: 'Porte-serviettes', what: 'Une barre chromée et sa serviette, au mur', price: 3_500, w: 0.58, d: 0.1, mount: 'wall' }),
  F({ id: 'porte_serviettes_bois', type: 'bath', grade: 'better', emoji: '🧺', name: 'Porte-serviettes en bois', what: 'Deux barres et une étagère de serviettes pliées, au mur', price: 24_000, w: 0.62, d: 0.2, mount: 'wall' }),
  F({ id: 'seche_serviettes', type: 'bath', grade: 'premium', emoji: '🧺', name: 'Sèche-serviettes chromé', what: 'Échelle chromée chauffante, au mur', price: 160_000, w: 0.62, d: 0.1, mount: 'wall' }),
  // lighting: floor lamps, hanging lamps (from the ceiling), bedside tables and their lamps
  F({ id: 'lampadaire_trepied', type: 'lamp', grade: 'better', emoji: '💡', name: 'Lampadaire trépied', what: 'Trois pieds en bois, grand abat-jour', price: 48_000, w: 0.56, d: 0.56 }),
  F({ id: 'lampadaire_arc', type: 'lamp', grade: 'premium', emoji: '💡', name: 'Lampadaire arc', what: 'Socle de marbre, arc chromé au-dessus du canapé', price: 390_000, w: 0.44, d: 1.12 }),
  F({ id: 'suspension_osier', type: 'lamp', grade: 'basic', emoji: '🏮', name: 'Suspension en osier', what: 'Un abat-jour tressé, au plafond', price: 9_000, w: 0.5, d: 0.5, mount: 'ceiling' }),
  F({ id: 'suspension_calebasse', type: 'lamp', grade: 'better', emoji: '🏮', name: 'Suspension calebasse', what: 'Une calebasse gravée à la main, au plafond', price: 35_000, w: 0.58, d: 0.58, mount: 'ceiling' }),
  F({ id: 'lustre', type: 'lamp', grade: 'premium', emoji: '🕯️', name: 'Lustre doré', what: 'Six bougies et des pampilles, au plafond', price: 560_000, w: 0.8, d: 0.8, mount: 'ceiling' }),
  F({ id: 'chevet_bois', type: 'lamp', grade: 'better', emoji: '🛏️', name: 'Table de chevet et sa lampe', what: 'Un tiroir, une niche et une lampe à abat-jour', price: 32_000, w: 0.48, d: 0.46, room: 'chambre' }),
  F({ id: 'chevet_sculpte', type: 'lamp', grade: 'premium', emoji: '🛏️', name: 'Chevet sculpté et lampe dorée', what: 'Bois sculpté, dessus de marbre, lampe dorée', price: 240_000, w: 0.52, d: 0.45, room: 'chambre' }),
  // bedroom storage and a dressing table
  F({ id: 'commode', type: 'wardrobe', grade: 'basic', emoji: '🗄️', name: 'Commode à trois tiroirs', what: 'Bois peint, trois tiroirs : « Se changer »', price: 30_000, w: 0.82, d: 0.47, use: change(5, 4) }),
  F({ id: 'penderie', type: 'wardrobe', grade: 'basic', emoji: '👗', name: 'Penderie ouverte', what: 'Une barre pour les boubous, une étagère à chaussures : « Se changer »', price: 14_000, w: 1.0, d: 0.5, use: change(5, 3) }),
  F({ id: 'armoire_3portes', type: 'wardrobe', grade: 'better', emoji: '🚪', name: 'Armoire trois portes', what: 'Trois portes dont un miroir : « Se changer »', price: 260_000, w: 1.54, d: 0.62, use: change(9, 7) }),
  F({ id: 'coiffeuse_doree', type: 'mirror', grade: 'premium', emoji: '🪞', name: 'Coiffeuse à triple miroir', what: 'Laquée et dorée, triple miroir, tabouret de velours : « Se préparer »', price: 450_000, w: 1.2, d: 0.52, room: 'chambre',
    use: { id: 'preparer', label: 'Se préparer', seconds: 2, needs: { hygiene: 18, moral: 12 }, counter: 'preparer' } }),
  // pictures, on the wall
  F({ id: 'affiche', type: 'decor', grade: 'basic', emoji: '🖼️', name: 'Affiche encadrée', what: 'Un baobab au coucher du soleil, cadre noir', price: 5_000, w: 0.52, d: 0.04, mount: 'wall' }),
  F({ id: 'sous_verre', type: 'decor', grade: 'better', emoji: '🖼️', name: 'Peintures sous-verre', what: 'Deux sous-verre peints à la main, cadres de couleur', price: 38_000, w: 0.76, d: 0.04, mount: 'wall' }),
  F({ id: 'toile_artiste', type: 'decor', grade: 'premium', emoji: '🖼️', name: 'Grande toile d’artiste', what: 'Des pirogues au soir, cadre doré et sa lampe', price: 480_000, w: 1.46, d: 0.16, mount: 'wall' }),
  // televisions on their wall units
  F({ id: 'tele_etagere', type: 'tv', grade: 'basic', emoji: '📺', name: 'Télé sur étagère', what: 'Écran plat, décodeur et petites enceintes : « Regarder la télé »', price: 55_000, w: 1.32, d: 0.36,
    use: { id: 'tele', label: 'Regarder la télé', seconds: 4, needs: { moral: 10, energie: 3 }, counter: 'tele', spot: [0, 1.5] } }),
  F({ id: 'meuble_tv', type: 'tv', grade: 'better', emoji: '📺', name: 'Meuble télé et étagères', what: 'Grand écran, meuble à tiroirs, deux colonnes de livres : « Regarder la télé »', price: 320_000, w: 1.8, d: 0.46,
    use: { id: 'tele', label: 'Regarder la télé', seconds: 4, needs: { moral: 15, energie: 3 }, counter: 'tele', spot: [0, 1.8] } }),
  F({ id: 'mur_tv', type: 'tv', grade: 'premium', emoji: '📺', name: 'Mur télé en bois sculpté', what: 'Très grand écran, barre de son, vitrines et lumière : « Regarder la télé »', price: 1_800_000, w: 2.4, d: 0.46,
    use: { id: 'tele', label: 'Regarder un film', seconds: 5, needs: { moral: 20, energie: 4, social: 2 }, counter: 'tele', spot: [0, 2.0] } }),
  // bookshelves (the kit's shelves)
  F({ id: 'etagere', type: 'shelf', grade: 'basic', emoji: '📚', name: 'Étagère en planches', what: 'Planches sur parpaings, la radio et les livres', price: 8_000, w: 1.04, d: 0.26 }),
  F({ id: 'bibliotheque', type: 'shelf', grade: 'better', emoji: '📚', name: 'Bibliothèque', what: '« Prendre un livre » : un peu de moral', price: 70_000, w: 0.9, d: 0.32, use: { id: 'lire', label: 'Prendre un livre', seconds: 4, needs: { moral: 6 } } }),
  F({ id: 'vitrine', type: 'shelf', grade: 'premium', emoji: '🏺', name: 'Vitrine de salon', what: 'Verres à thé et assiettes de fête : « Sortir les beaux verres »', price: 520_000, w: 1.08, d: 0.48,
    use: { id: 'verres', label: 'Sortir les beaux verres', seconds: 3, needs: { moral: 8, social: 3 } } }),
  // outdoor and poolside: for the houses and villas to come; in the F2, in the séjour by the window
  F({ id: 'transat', type: 'outdoor', grade: 'basic', emoji: '🏖️', name: 'Transat en toile', what: 'Bois et toile rayée : « Se détendre »', price: 15_000, w: 0.62, d: 1.22,
    seats: [{ x: 0, z: 0.05, top: 0.4, yaw: 0, kind: 'chair' }], use: lounge(6, 6) }),
  F({ id: 'bain_soleil', type: 'outdoor', grade: 'better', emoji: '🏖️', name: 'Bain de soleil tressé', what: 'Résine tressée et coussins : « Se détendre »', price: 110_000, w: 0.7, d: 1.9,
    seats: [{ x: 0, z: 0.15, top: 0.45, yaw: 0, kind: 'bed', clip: 'Lie' }], use: lounge(8, 9) }),
  F({ id: 'bain_soleil_teck', type: 'outdoor', grade: 'premium', emoji: '🏖️', name: 'Bain de soleil en teck', what: 'Teck massif, matelas épais, roulettes : « Se détendre »', price: 460_000, w: 0.76, d: 1.96,
    seats: [{ x: 0, z: 0.25, top: 0.49, yaw: 0, kind: 'bed', clip: 'Lie' }], use: lounge(10, 12) }),
  F({ id: 'parasol', type: 'outdoor', grade: 'basic', emoji: '⛱️', name: 'Parasol de plage', what: 'Toile rayée rouge et blanche, pied lesté', price: 12_000, w: 1.6, d: 1.6 }),
  F({ id: 'parasol_bois', type: 'outdoor', grade: 'better', emoji: '⛱️', name: 'Parasol en bois', what: 'Mât en bois, toile écrue à lambrequins', price: 85_000, w: 2.0, d: 2.0 }),
  F({ id: 'parasol_deporte', type: 'outdoor', grade: 'premium', emoji: '⛱️', name: 'Parasol déporté', what: 'Grand carré sur un mât déporté, socle de granit, éclairé', price: 420_000, w: 2.2, d: 2.2 }),
  F({ id: 'salon_jardin', type: 'outdoor', grade: 'basic', emoji: '🪑', name: 'Salon de jardin en plastique', what: 'Table ronde et quatre fauteuils : « Préparer l’ataya »', price: 24_000, w: 1.82, d: 1.82,
    seats: ringOf(0.59, 0.55), use: ataya(6, 4) }),
  F({ id: 'salon_fer_forge', type: 'outdoor', grade: 'better', emoji: '🪑', name: 'Salon de jardin en fer forgé', what: 'Table en mosaïque, quatre chaises à coussins : « Préparer l’ataya »', price: 150_000, w: 1.72, d: 1.72,
    seats: ringOf(0.59, 0.59), use: ataya(8, 5) }),
  F({ id: 'salon_teck', type: 'outdoor', grade: 'premium', emoji: '🪑', name: 'Salon de jardin en teck', what: 'Table en teck, quatre fauteuils et leur parasol : « Préparer l’ataya »', price: 780_000, w: 2.1, d: 2.1,
    seats: setOf([[-0.35, -0.69, 0], [0.35, -0.69, 0], [-0.35, 0.69, PI], [0.35, 0.69, PI]], 0.58), use: ataya(10, 6) }),
  // ---- the catalogue's second round (docs/ld2/LD2_C.md « Catalogue, round 2 »), comfort lane (K-C): its pieces here
  // poufs: one low seat each (the salon's chairs)
  F({ id: 'pouf_cuir', type: 'chair', grade: 'basic', emoji: '🪑', name: 'Pouf en cuir', what: 'Cuir repoussé et cousu main : une place de plus', price: 12_000, w: 0.5, d: 0.5,
    seats: [{ x: 0, z: 0, top: 0.5, yaw: 0, kind: 'stool' }] }),
  F({ id: 'pouf_wax', type: 'chair', grade: 'better', emoji: '🪑', name: 'Pouf en wax', what: 'Deux wax et un passepoil ocre : une place de plus', price: 35_000, w: 0.56, d: 0.56,
    seats: [{ x: 0, z: 0, top: 0.55, yaw: 0, kind: 'stool' }] }),
  F({ id: 'pouf_velours', type: 'chair', grade: 'premium', emoji: '🪑', name: 'Pouf capitonné en velours', what: 'Velours bordeaux capitonné, boutons et pieds dorés', price: 180_000, w: 0.6, d: 0.6,
    seats: [{ x: 0, z: 0, top: 0.56, yaw: 0, kind: 'stool' }] }),
  // corner sofas: the back run along a wall, its return on the left (« Se détendre » on the first place)
  F({ id: 'banquette_angle', type: 'sofa', grade: 'basic', emoji: '🛋️', name: 'Banquette d’angle', what: 'Cadre en bois et mousses, quatre places en coin : « Se détendre »', price: 45_000, w: 2.2, d: 1.7,
    seats: [{ x: -0.023, z: -0.43, top: 0.54, yaw: 0, kind: 'sofa' }, { x: 0.693, z: -0.43, top: 0.54, yaw: 0, kind: 'sofa' }, { x: -0.66, z: -0.41, top: 0.54, yaw: PI / 4, kind: 'sofa' },
      { x: -0.68, z: 0.335, top: 0.54, yaw: PI / 2, kind: 'sofa' }], use: lounge(8, 7) }),
  F({ id: 'canape_angle', type: 'sofa', grade: 'better', emoji: '🛋️', name: 'Canapé d’angle en tissu', what: 'Tissu sable et coussins en wax, quatre places : « Se détendre »', price: 260_000, w: 2.6, d: 1.9,
    seats: [{ x: -0.05, z: -0.46, top: 0.58, yaw: 0, kind: 'sofa' }, { x: 0.73, z: -0.46, top: 0.58, yaw: 0, kind: 'sofa' }, { x: -0.79, z: -0.44, top: 0.58, yaw: PI / 4, kind: 'sofa' },
      { x: -0.81, z: 0.34, top: 0.58, yaw: PI / 2, kind: 'sofa' }], use: lounge(11, 11) }),
  F({ id: 'canape_angle_velours', type: 'sofa', grade: 'premium', emoji: '🛋️', name: 'Grand canapé d’angle en velours', what: 'Velours bordeaux, cadre sculpté et doré, cinq places : « Se détendre »', price: 1_400_000, w: 3.0, d: 2.1,
    seats: [{ x: -0.245, z: -0.515, top: 0.62, yaw: 0, kind: 'sofa' }, { x: 0.365, z: -0.515, top: 0.62, yaw: 0, kind: 'sofa' }, { x: 0.975, z: -0.515, top: 0.62, yaw: 0, kind: 'sofa' },
      { x: -0.945, z: -0.495, top: 0.62, yaw: PI / 4, kind: 'sofa' }, { x: -0.965, z: 0.365, top: 0.62, yaw: PI / 2, kind: 'sofa' }], use: lounge(16, 16) }),
  // canopy beds (sleep)
  F({ id: 'lit_moustiquaire', type: 'bed', grade: 'basic', emoji: '🛏️', name: 'Lit et sa moustiquaire', what: 'Lit en fer peint sous sa moustiquaire : des nuits sans moustiques', price: 30_000, w: 1.5, d: 2.1, sleep: 65, seats: bedSeat(1.5, 0.58) }),
  F({ id: 'lit_baldaquin_bois', type: 'bed', grade: 'better', emoji: '🛏️', name: 'Lit à baldaquin en bois', what: 'Quatre colonnes sculptées, un ciel de lit et un couvre-lit en wax', price: 240_000, w: 1.62, d: 2.14, sleep: 85, seats: bedSeat(1.62, 0.72) }),
  F({ id: 'lit_baldaquin', type: 'bed', grade: 'premium', emoji: '🛏️', name: 'Lit à baldaquin et voilages', what: 'Colonnes dorées et voilages, brocart, velours et coussins', price: 1_600_000, w: 1.96, d: 2.3, sleep: 100, seats: bedSeat(1.96, 0.79) }),
  // entrance consoles (the entrée): a mirror on the wall above the better ones
  F({ id: 'console_simple', type: 'shelf', grade: 'basic', emoji: '🔑', name: 'Console et vide-poche', what: 'Une calebasse pour les clés, un porte-clés au mur : « Vider ses poches »', price: 9_000, w: 0.8, d: 0.3, room: 'entree',
    use: { id: 'videpoche', label: 'Vider ses poches', seconds: 1, needs: { moral: 2 } } }),
  F({ id: 'console_bois', type: 'shelf', grade: 'better', emoji: '🪞', name: 'Console en bois et miroir', what: 'Bois verni, deux tiroirs, un miroir au mur : « Se préparer » avant de sortir', price: 85_000, w: 1.1, d: 0.36, room: 'entree', use: prepare(10, 6) }),
  F({ id: 'console_marbre', type: 'shelf', grade: 'premium', emoji: '🪞', name: 'Console en marbre et miroir doré', what: 'Marbre blanc, bois doré, grand miroir et son encensoir : « Se préparer »', price: 520_000, w: 1.3, d: 0.42, room: 'entree', use: prepare(16, 12) }),
  // kit models already drawn, sold now
  F({ id: 'fauteuil_velours', type: 'chair', grade: 'premium', emoji: '💺', name: 'Fauteuil de salon en velours', what: 'Velours bordeaux et bois doré, assorti au grand canapé', price: 420_000, w: 1.26, d: 1.0,
    seats: [{ x: 0, z: 0.06, top: 0.58, yaw: 0, kind: 'chair' }] }),
  F({ id: 'chaise_sculptee', type: 'chair', grade: 'premium', emoji: '🪑', name: 'Chaise sculptée', what: 'Dossier sculpté et doré, assise de velours', price: 95_000, w: 0.52, d: 0.6, seats: [{ x: 0, z: 0.03, top: 0.65, yaw: 0, kind: 'chair' }] }),
  F({ id: 'table_basse_sculptee', type: 'table', grade: 'premium', emoji: '🫖', name: 'Table basse sculptée', what: 'Bois sculpté et plateau de marbre : « Préparer l’ataya »', price: 260_000, w: 1.24, d: 0.68, use: ataya(10, 5) }),
  F({ id: 'armoire_miroir', type: 'wardrobe', grade: 'premium', emoji: '🪞', name: 'Grande armoire à miroir', what: 'Bois sculpté, une porte à miroir : « Se changer »', price: 680_000, w: 1.62 + 0.1, d: 0.66, use: change(10, 9) }),   // the kit's 1.62 + 0.1, to the bit
  F({ id: 'attaya_gaz', type: 'table', grade: 'better', emoji: '🫖', name: 'Attaya au gaz et ses coussins', what: 'Réchaud à gaz, théière et trois coussins en wax : « Préparer l’ataya » assis', price: 45_000, w: 1.6, d: 1.12,
    seats: [{ x: 0, z: 0.32, top: 0.17, yaw: PI, kind: 'floor', clip: 'SitFloor' }, { x: -0.58, z: -0.2, top: 0.17, yaw: PI / 2, kind: 'floor', clip: 'SitFloor' }, { x: 0.58, z: -0.2, top: 0.17, yaw: -PI / 2, kind: 'floor', clip: 'SitFloor' }],
    use: { ...ataya(9, 6), sit: true } }),
  F({ id: 'attaya_service', type: 'table', grade: 'premium', emoji: '🫖', name: 'Grand service à attaya', what: 'Plateau doré, six verres, trois coussins de velours : « Préparer l’ataya » assis', price: 220_000, w: 1.72, d: 1.18,
    seats: [{ x: 0, z: 0.32, top: 0.2, yaw: PI, kind: 'floor', clip: 'SitFloor' }, { x: -0.58, z: -0.2, top: 0.2, yaw: PI / 2, kind: 'floor', clip: 'SitFloor' }, { x: 0.58, z: -0.2, top: 0.2, yaw: -PI / 2, kind: 'floor', clip: 'SitFloor' }],
    use: { ...ataya(12, 8), sit: true } }),
  // prayer mats (flat). Prayer brings no reward (src/activity/primitives.ts): the mat is unrolled, nothing more
  F({ id: 'tapis_priere_tisse', type: 'rug', grade: 'better', emoji: '🟦', name: 'Tapis de prière tissé', what: 'Tissé, bordure géométrique et son arche', price: 18_000, w: 0.66, d: 1.16, flat: true,
    use: { id: 'tapis_priere', label: 'Dérouler le tapis', seconds: 2, needs: {}, spot: [0, 0.3] } }),
  F({ id: 'tapis_priere_velours', type: 'rug', grade: 'premium', emoji: '🟥', name: 'Tapis de prière en velours', what: 'Velours bordeaux, motifs et franges dorés', price: 95_000, w: 0.7, d: 1.3, flat: true,
    use: { id: 'tapis_priere', label: 'Dérouler le tapis', seconds: 2, needs: {}, spot: [0, 0.3] } }),
  //
  // (the comfort lane's pieces above, the decoration lane's below)
  //
  // ---- the catalogue's second round, decoration lane (K-D): its pieces here
  // floor vases and sculptures (anywhere, the séjour first)
  F({ id: 'jarre_herbes', type: 'decor', grade: 'basic', emoji: '🏺', name: 'Jarre en terre et herbes sèches', what: 'Terre cuite gravée et un bouquet d’herbes sèches', price: 6_000, w: 0.38, d: 0.36 }),
  F({ id: 'vase_bouquet', type: 'decor', grade: 'better', emoji: '💐', name: 'Vase en céramique et bouquet', what: 'Émail bleu de cobalt et bougainvilliers en fleurs', price: 45_000, w: 0.5, d: 0.48 }),
  F({ id: 'vase_orchidees', type: 'decor', grade: 'premium', emoji: '🌸', name: 'Grand vase doré et orchidées', what: 'Vase doré sur marbre noir, orchidées blanches en arc', price: 260_000, w: 0.5, d: 0.48 }),
  F({ id: 'statuette_bois', type: 'decor', grade: 'basic', emoji: '🪵', name: 'Statuette en bois sculpté', what: 'Une femme au pilon, taillée d’un seul bloc', price: 15_000, w: 0.3, d: 0.3 }),
  F({ id: 'sculpture_ebene', type: 'decor', grade: 'better', emoji: '♟️', name: 'Sculpture en ébène sur socle', what: 'Une porteuse de calebasse, ébène et aubier, sur son socle', price: 120_000, w: 0.34, d: 0.34 }),
  F({ id: 'bronze_marbre', type: 'decor', grade: 'premium', emoji: '🤼', name: 'Bronze sur socle de marbre', what: 'Un lutteur en garde, en bronze, sur marbre blanc', price: 950_000, w: 0.54, d: 0.54 }),
  // wall decoration, on the wall
  F({ id: 'paniers_muraux', type: 'decor', grade: 'basic', emoji: '🧺', name: 'Paniers tressés au mur', what: 'Six paniers plats aux couleurs vives, au mur', price: 8_000, w: 0.9, d: 0.04, mount: 'wall' }),
  F({ id: 'masques_sculptes', type: 'decor', grade: 'better', emoji: '🎭', name: 'Masques sculptés', what: 'Trois masques en bois sculpté, au mur', price: 65_000, w: 0.94, d: 0.09, mount: 'wall' }),
  F({ id: 'miroir_soleil', type: 'decor', grade: 'premium', emoji: '☀️', name: 'Miroir soleil doré', what: 'Un miroir rond aux rayons dorés, au mur : « Se préparer »', price: 380_000, w: 0.9, d: 0.05, mount: 'wall', use: prepare(8, 10) }),
  // folding screens: one changes behind them (the bedroom first)
  F({ id: 'paravent_raphia', type: 'decor', grade: 'basic', emoji: '🎋', name: 'Paravent en raphia', what: 'Quatre panneaux de raphia tressé : « Se changer »', price: 14_000, w: 1.5, d: 0.23, room: 'chambre', use: change(4, 3) }),
  F({ id: 'paravent_bois', type: 'decor', grade: 'better', emoji: '🪟', name: 'Paravent en bois sculpté', what: 'Bois sombre ajouré, une rosace par panneau : « Se changer »', price: 110_000, w: 1.57, d: 0.25, room: 'chambre', use: change(5, 5) }),
  F({ id: 'paravent_laque', type: 'decor', grade: 'premium', emoji: '✨', name: 'Paravent laqué et doré', what: 'Laque noire, baobab à la feuille d’or : « Se changer »', price: 560_000, w: 1.65, d: 0.27, room: 'chambre', use: change(6, 8) }),
  // lanterns: light for the evening
  F({ id: 'lanterne_tempete', type: 'lamp', grade: 'basic', emoji: '🪔', name: 'Lanterne tempête', what: 'Une lampe tempête sur son tabouret, lumière chaude', price: 4_500, w: 0.3, d: 0.3 }),
  F({ id: 'lanternes_fer', type: 'lamp', grade: 'better', emoji: '🏮', name: 'Lanternes en fer ajouré', what: 'Deux lanternes en fer ajouré : la lumière en étoiles', price: 38_000, w: 0.54, d: 0.36 }),
  F({ id: 'candelabre_cristal', type: 'lamp', grade: 'premium', emoji: '🕯️', name: 'Candélabre en cristal', what: 'Cristal taillé, six bougies, pied de marbre', price: 450_000, w: 0.54, d: 0.56 }),
  // aquariums: « Regarder les poissons »
  F({ id: 'bocal_poissons', type: 'decor', grade: 'basic', emoji: '🐟', name: 'Bocal et poissons rouges', what: 'Deux poissons rouges dans leur bocal : « Regarder les poissons »', price: 9_000, w: 0.38, d: 0.38,
    use: { id: 'poissons', label: 'Regarder les poissons', seconds: 4, needs: { moral: 4 } } }),
  F({ id: 'aquarium_meuble', type: 'decor', grade: 'better', emoji: '🐠', name: 'Aquarium sur meuble', what: 'Plantes, scalaires et néons, sur son meuble : « Regarder les poissons »', price: 190_000, w: 1.02, d: 0.44,
    use: { id: 'poissons', label: 'Regarder les poissons', seconds: 4, needs: { moral: 8 } } }),
  F({ id: 'aquarium_mer', type: 'decor', grade: 'premium', emoji: '🐡', name: 'Grand aquarium d’eau de mer', what: 'Coraux, anémone et poissons des récifs : « Regarder les poissons »', price: 1_900_000, w: 1.8, d: 0.5,
    use: { id: 'poissons', label: 'Regarder les poissons', seconds: 5, needs: { moral: 14, energie: 2 } } }),
  // ---------------------------------------------------------------- LD2.0-D « Collection Almadies » (lane K-L): the modern-luxury line, all Prestige
  // From the owner's three reference sheets (docs/ld2/LD2_D.md): ivory bouclé, greige linen, walnut, black and white marble, brushed bronze, black
  // leather; each on its own kit model (src/world/furnitureKit.ts « Collection Almadies »: footprints and seats are the kit's). New ids only.
  // (The doc's « salle_manger_marbre » is already sold, LD2.0-C's six-chair marble set: the round marble table is `salle_manger_ronde`.)
  // the living room: sofas, armchairs, low tables, the TV stand, the sideboard, the shelves
  F({ id: 'canape_courbe', type: 'sofa', grade: 'premium', line: 'almadies', emoji: '🛋️', name: 'Grand canapé courbe sur socle bronze', what: 'Trois modules en bouclé ivoire, socle bronze en retrait : « Se détendre »', price: 7_500_000, w: 3.4, d: 1.3,
    seats: [{ x: -0.932, z: 0.111, top: 0.59, yaw: 0.257, kind: 'sofa' }, { x: -0.314, z: 0.003, top: 0.59, yaw: 0.086, kind: 'sofa' }, { x: 0.314, z: 0.003, top: 0.59, yaw: -0.086, kind: 'sofa' },
      { x: 0.932, z: 0.111, top: 0.59, yaw: -0.257, kind: 'sofa' }], use: lounge(18, 18) }),
  F({ id: 'canape_meridienne', type: 'sofa', grade: 'premium', line: 'almadies', emoji: '🛋️', name: 'Canapé d’angle méridienne en lin', what: 'Lin grège, méridienne à gauche, coussins passepoilés : « Se détendre »', price: 4_800_000, w: 2.8, d: 1.6,
    seats: [{ x: 0.78, z: -0.16, top: 0.61, yaw: 0, kind: 'sofa' }, { x: -0.04, z: -0.16, top: 0.61, yaw: 0, kind: 'sofa' }, { x: -0.925, z: -0.16, top: 0.61, yaw: 0, kind: 'sofa' }], use: lounge(16, 15) }),
  F({ id: 'canape_boucle', type: 'sofa', grade: 'premium', line: 'almadies', emoji: '🛋️', name: 'Canapé arrondi en bouclé, socle doré', what: 'Bouclé ivoire tout en courbes, deux coussins ronds : « Se détendre »', price: 3_200_000, w: 2.3, d: 0.9,
    seats: [{ x: -0.6, z: 0.06, top: 0.58, yaw: 0, kind: 'sofa' }, { x: 0, z: 0.06, top: 0.58, yaw: 0, kind: 'sofa' }, { x: 0.6, z: 0.06, top: 0.58, yaw: 0, kind: 'sofa' }], use: lounge(14, 14) }),
  F({ id: 'fauteuil_boucle', type: 'chair', grade: 'premium', line: 'almadies', emoji: '💺', name: 'Fauteuil cocon en bouclé', what: 'Une coque en bouclé ivoire sur pieds sombres : « Se détendre »', price: 1_400_000, w: 0.86, d: 0.84,
    seats: [{ x: 0, z: 0.09, top: 0.57, yaw: 0, kind: 'chair' }], use: lounge(9, 9) }),
  F({ id: 'fauteuil_noyer', type: 'chair', grade: 'premium', line: 'almadies', emoji: '💺', name: 'Fauteuil enveloppant, lin et noyer', what: 'Lin grège, coussin taupe, pieds en noyer : « Se détendre »', price: 1_100_000, w: 0.8, d: 0.85,
    seats: [{ x: 0, z: 0.08, top: 0.59, yaw: 0, kind: 'chair' }], use: lounge(8, 8) }),
  F({ id: 'table_basse_marbre_noir', type: 'table', grade: 'premium', line: 'almadies', emoji: '🫖', name: 'Table basse en marbre noir', what: 'Marbre noir veiné, pieds en bloc : « Préparer l’ataya »', price: 2_400_000, w: 1.2, d: 0.8, use: ataya(12, 6) }),
  F({ id: 'table_basse_noyer', type: 'table', grade: 'premium', line: 'almadies', emoji: '🫖', name: 'Table basse en marbre blanc et noyer', what: 'Plateau de marbre, tiroir et niche en noyer : « Préparer l’ataya »', price: 1_600_000, w: 1.2, d: 0.6, use: ataya(11, 5) }),
  F({ id: 'gueridon_marbre', type: 'table', grade: 'premium', line: 'almadies', emoji: '☕', name: 'Guéridon en marbre sur fût noir', what: 'Plateau rond en marbre noir, fût laqué noir', price: 650_000, w: 0.5, d: 0.5 }),
  F({ id: 'meuble_tv_laque', type: 'tv', grade: 'premium', line: 'almadies', emoji: '📺', name: 'Meuble télé bas laqué', what: 'Grand écran sur un meuble laqué grège, socle en retrait : « Regarder la télé »', price: 1_900_000, w: 2.4, d: 0.45,
    use: { id: 'tele', label: 'Regarder la télé', seconds: 4, needs: { moral: 18, energie: 4 }, counter: 'tele', spot: [0, 2.0] } }),
  F({ id: 'enfilade_bronze', type: 'shelf', grade: 'premium', line: 'almadies', emoji: '🏺', name: 'Enfilade grège à filets bronze', what: 'Laque grège, filets de bronze brossé : « Sortir les beaux verres »', price: 2_800_000, w: 1.8, d: 0.48,
    use: { id: 'verres', label: 'Sortir les beaux verres', seconds: 3, needs: { moral: 10, social: 4 } } }),
  F({ id: 'bibliotheque_noyer', type: 'shelf', grade: 'premium', line: 'almadies', emoji: '📚', name: 'Bibliothèque éclairée en noyer', what: 'Niches éclairées, portes grèges en bas : « Prendre un livre »', price: 2_200_000, w: 1.6, d: 0.3,
    use: { id: 'lire', label: 'Prendre un livre', seconds: 4, needs: { moral: 10 } } }),
  F({ id: 'bibliotheque_bronze', type: 'shelf', grade: 'premium', line: 'almadies', emoji: '📚', name: 'Étagère ouverte noir et bronze', what: 'Montants noirs, tablettes filetées de bronze : « Prendre un livre »', price: 1_300_000, w: 1.5, d: 0.38,
    use: { id: 'lire', label: 'Prendre un livre', seconds: 4, needs: { moral: 8 } } }),
  // dining
  F({ id: 'salle_manger_ronde', type: 'dining', grade: 'premium', line: 'almadies', emoji: '🍽️', name: 'Table ronde en marbre et quatre chaises', what: 'Marbre noir sur fût cannelé, chaises tapissées : « Préparer l’ataya »', price: 6_500_000, w: 1.96, d: 1.96,
    seats: setOf([[0.587, 0.587, -2.356], [0.587, -0.587, -0.785], [-0.587, -0.587, 0.785], [-0.587, 0.587, 2.356]], 0.59), use: ataya(14, 7) }),
  F({ id: 'salle_manger_noyer', type: 'dining', grade: 'premium', line: 'almadies', emoji: '🍽️', name: 'Table en noyer et quatre chaises', what: 'Noyer massif, chaises en Y et assises en lin : « Préparer l’ataya »', price: 3_600_000, w: 1.6, d: 1.74,
    seats: setOf([[-0.4, -0.57, 0], [0.4, -0.57, 0], [-0.4, 0.57, PI], [0.4, 0.57, PI]], 0.58), use: ataya(11, 6) }),
  // the bedroom
  F({ id: 'lit_capitonne_noir', type: 'bed', grade: 'premium', line: 'almadies', emoji: '🛏️', name: 'Lit en cuir noir capitonné', what: 'Tête de lit en cuir noir capitonné, linge blanc et plaid taupe', price: 5_800_000, w: 2.1, d: 2.3, sleep: 100, seats: bedSeat(2.1, 0.75) }),
  F({ id: 'lit_lin_greige', type: 'bed', grade: 'premium', line: 'almadies', emoji: '🛏️', name: 'Lit tapissier en lin grège', what: 'Tête de lit à oreilles en lin grège, jeté matelassé', price: 4_900_000, w: 2.0, d: 2.3, sleep: 100, seats: bedSeat(2.0, 0.73) }),
  F({ id: 'lit_noyer', type: 'bed', grade: 'premium', line: 'almadies', emoji: '🛏️', name: 'Lit en noyer, tête tapissée', what: 'Cadre en noyer, tête de lit tapissée de lin taupe', price: 3_400_000, w: 1.8, d: 2.1, sleep: 100, seats: bedSeat(1.8, 0.66) }),
  F({ id: 'chevet_greige', type: 'lamp', grade: 'premium', line: 'almadies', emoji: '🛏️', name: 'Chevet arrondi grège', what: 'Laque grège aux angles arrondis, lampe champignon', price: 450_000, w: 0.55, d: 0.42, room: 'chambre' }),
  F({ id: 'chevet_noyer', type: 'lamp', grade: 'premium', line: 'almadies', emoji: '🛏️', name: 'Chevet en noyer, deux tiroirs', what: 'Noyer et tiroirs grèges, lampe en céramique', price: 380_000, w: 0.5, d: 0.42, room: 'chambre' }),
  F({ id: 'banc_lit', type: 'chair', grade: 'premium', line: 'almadies', emoji: '🪑', name: 'Banc de lit tapissé', what: 'Lin grège passepoilé sur socle noir, au pied du lit', price: 900_000, w: 1.4, d: 0.45, room: 'chambre',
    seats: [{ x: -0.35, z: 0, top: 0.57, yaw: 0, kind: 'stool' }, { x: 0.35, z: 0, top: 0.57, yaw: 0, kind: 'stool' }] }),
  F({ id: 'commode_six', type: 'wardrobe', grade: 'premium', line: 'almadies', emoji: '🗄️', name: 'Commode six tiroirs', what: 'Laque grège, six tiroirs, tirettes en bronze : « Se changer »', price: 1_800_000, w: 1.6, d: 0.52, use: change(9, 8) }),
  F({ id: 'chiffonnier_noyer', type: 'wardrobe', grade: 'premium', line: 'almadies', emoji: '🗄️', name: 'Chiffonnier en noyer', what: 'Noyer, cinq tiroirs grèges : « Se changer »', price: 1_200_000, w: 0.8, d: 0.42, use: change(8, 7) }),
  F({ id: 'dressing_bronze', type: 'wardrobe', grade: 'premium', line: 'almadies', emoji: '🚪', name: 'Dressing quatre portes, poignées bronze', what: 'Quatre portes laquées, longues poignées en bronze : « Se changer »', price: 4_200_000, w: 2.0, d: 0.64, use: change(12, 12) }),
  F({ id: 'coiffeuse_ronde', type: 'mirror', grade: 'premium', line: 'almadies', emoji: '🪞', name: 'Coiffeuse, miroir rond et tabouret', what: 'Noyer, miroir rond cerclé de laiton, tabouret : « Se préparer »', price: 1_500_000, w: 1.0, d: 0.86, room: 'chambre',
    seats: [{ x: 0, z: 0.22, top: 0.58, yaw: PI, kind: 'stool' }], use: { id: 'preparer', label: 'Se préparer', seconds: 2, needs: { hygiene: 18, moral: 14 }, counter: 'preparer', sit: true } }),
  // the office
  F({ id: 'bureau_caisson', type: 'desk', grade: 'premium', line: 'almadies', emoji: '🖥️', name: 'Bureau à caisson et chaise tapissée', what: 'Caisson grège, piètement noir : « Travailler au bureau », +4 000 F par heure en ville', price: 2_600_000, w: 1.5, d: 1.25,
    seats: [{ x: 0, z: 0.305, top: 0.59, yaw: PI, kind: 'chair' }], use: { id: 'bureau', label: 'Travailler au bureau', seconds: 6, needs: { energie: -5, moral: 4 }, pay: 4_000, sit: true, spot: [0, 0.95] } }),
  // light and decoration
  F({ id: 'lustre_couronne', type: 'lamp', grade: 'premium', line: 'almadies', emoji: '💎', name: 'Lustre couronne de cristal', what: 'Une couronne de cristal entre deux cercles de laiton, au plafond', price: 6_000_000, w: 0.9, d: 0.9, mount: 'ceiling' }),
  F({ id: 'lampadaire_champignon', type: 'lamp', grade: 'premium', line: 'almadies', emoji: '💡', name: 'Lampadaire champignon', what: 'Un dôme grège sur une tige de bronze, lumière douce', price: 480_000, w: 0.45, d: 0.45 }),
  F({ id: 'lampadaire_arc_plisse', type: 'lamp', grade: 'premium', line: 'almadies', emoji: '💡', name: 'Lampadaire arc, abat-jour plissé', what: 'Arc en bronze brossé, abat-jour plissé, pied en noyer', price: 520_000, w: 0.44, d: 0.9 }),
  F({ id: 'tapis_rond_jute', type: 'rug', grade: 'premium', line: 'almadies', emoji: '🟤', name: 'Grand tapis rond en jute', what: 'Jute tressée, 2,2 m de diamètre : « Se poser sur le tapis »', price: 700_000, w: 2.2, d: 2.2, flat: true,
    seats: [{ x: -0.5, z: 0, top: 0.112, yaw: 0, kind: 'mat', clip: 'SitFloor' }, { x: 0.5, z: 0, top: 0.112, yaw: 0, kind: 'mat', clip: 'SitFloor' }],
    use: { id: 'tapis', label: 'Se poser sur le tapis', seconds: 3, needs: { energie: 10, moral: 10 }, spot: [0, 0] } }),
  F({ id: 'miroir_ovale', type: 'mirror', grade: 'premium', line: 'almadies', emoji: '🪞', name: 'Miroir ovale, cadre bronze', what: 'Un grand miroir ovale cerclé de bronze, au mur : « Se préparer »', price: 850_000, w: 0.7, d: 0.05, mount: 'wall', use: prepare(16, 12) }),
  F({ id: 'pot_cannele', type: 'plant', grade: 'premium', line: 'almadies', emoji: '🪴', name: 'Ficus en pot cannelé', what: 'Un ficus d’1,40 m dans un pot cannelé crème : « Arroser la plante »', price: 350_000, w: 0.6, d: 0.6,
    use: { id: 'arroser', label: 'Arroser la plante', seconds: 2, needs: { moral: 6 }, spot: [0, 0.7] } }),
];

// ------------------------------------------------------------------ a supporter's colours (the arena's stall « Couleurs du Géew »)
export type GearEcurie = 'baobab' | 'teranga';
export type GearItem = 'scarf' | 'cap' | 'flag' | 'tee';
/** Something to wear in an écurie's colours (src/economy/wear.ts): one of each, worn one at a time, seen by the others. */
export interface WearSpec extends AssetSpec { kind: 'wear'; ecurie: GearEcurie; item: GearItem }
const GEAR_KINDS: readonly { item: GearItem; id: string; name: string; what: string; price: number }[] = [
  { item: 'scarf', id: 'echarpe', name: 'Écharpe', what: 'Autour du cou, dans la tribune comme en ville', price: 2_000 },
  { item: 'cap', id: 'casquette', name: 'Casquette', what: 'Aux deux couleurs de l’écurie', price: 2_500 },
  { item: 'flag', id: 'drapeau', name: 'Petit drapeau', what: 'Il se lève avec les bras quand la tribune crie', price: 1_500 },
  { item: 'tee', id: 'maillot', name: 'Maillot', what: 'Le tee-shirt rayé de l’écurie', price: 4_000 },
];
/** Écuries of the game (fictional, src/arena/exteriorRules.ts ECURIES): Baobab green and yellow, Teranga red and white. */
const GEAR_ECURIES: readonly { id: GearEcurie; name: string }[] = [{ id: 'baobab', name: 'Baobab' }, { id: 'teranga', name: 'Teranga' }];
export const WEAR: WearSpec[] = GEAR_ECURIES.flatMap(e => GEAR_KINDS.map(k => ({
  id: `${k.id}_${e.id}`, kind: 'wear' as const, ecurie: e.id, item: k.item, name: `${k.name} ${e.name}`, what: `${k.what} · écurie ${e.name}`, price: k.price,
  where: 'Couleurs du Géew · Arène de Pikine',
})));

export const ASSET_SPECS: AssetSpec[] = [...HOMES, ...LAND, ...BILLBOARDS, ...BUSINESSES, ...VEHICLES, ...AIRCRAFT, ...FURNITURE_SPECS, ...WEAR];
const BY_ID = new Map(ASSET_SPECS.map(s => [s.id, s]));
export const specOf = (id: string): AssetSpec | undefined => BY_ID.get(id);
export const homeSpec = (id: string): HomeSpec | undefined => { const s = BY_ID.get(id); return s?.kind === 'home' ? s as HomeSpec : undefined; };
export const furnitureSpec = (id: string): FurnitureSpec | undefined => { const s = BY_ID.get(id); return s?.kind === 'furniture' ? s as FurnitureSpec : undefined; };
export const wearSpec = (id: string): WearSpec | undefined => { const s = BY_ID.get(id); return s?.kind === 'wear' ? s as WearSpec : undefined; };
/** The home whose street door is `doorId`. */
export const homeByDoor = (doorId: string) => HOMES.find(h => h.home.door === doorId);
