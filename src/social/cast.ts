import type { HubId } from '../core/types';
import type { Outfit } from '../actors/character';

/**
 * Launch cast — PROVISIONAL DRAFT (names, roles and links invented for the prototype; Habib to review).
 * All names are fictional. Écurie names are fictional so no real écurie is represented.
 */
export type Role = 'coach' | 'wrestler' | 'neighbour' | 'vendor' | 'employer';
export interface CastMember {
  id: string; name: string; title: string; role: Role; hub: HubId;
  /** Interactable kind this character stands next to (garage, gargote, cafe, market, gym, port, restaurant, ecurie, arena, home). */
  anchor: string; ox: number; oz: number;
  outfit: Outfit;
  female?: boolean;
}

export const CAST: CastMember[] = [
  { id: 'ibou', name: 'Tonton Ibou', title: 'voisin', role: 'neighbour', hub: 'pikine', anchor: 'home', ox: 6, oz: 0, outfit: { top: 0xf2f2ec, bottom: 0xf2f2ec, skin: 0x5b3420, long: true, hat: 0xd9d2c4 } },
  { id: 'modou', name: 'Modou', title: 'garagiste', role: 'employer', hub: 'pikine', anchor: 'garage', ox: -4, oz: 0, outfit: { top: 0x3c4a5c, bottom: 0x3c4a5c, skin: 0x6b3f25 } },
  { female: true, id: 'mame', name: 'Mame Diarra', title: 'cuisinière', role: 'vendor', hub: 'pikine', anchor: 'gargote', ox: 4, oz: 0, outfit: { top: 0xe58a2f, bottom: 0xe58a2f, skin: 0x7a4a2c, long: true, hat: 0xe7b82f } },
  { id: 'ablaye', name: 'Coach Ablaye', title: 'coach · écurie Baobab', role: 'coach', hub: 'pikine', anchor: 'ecurie', ox: -3, oz: -2, outfit: { top: 0x1a7a44, bottom: 0x2b2b33, skin: 0x4e2e1c } },
  { id: 'babacar', name: 'Babacar', title: 'lutteur · écurie Baobab', role: 'wrestler', hub: 'pikine', anchor: 'ecurie', ox: 3, oz: -3, outfit: { top: 0x5b3420, bottom: 0xf2f2ec, skin: 0x5b3420 } },
  { id: 'lamine', name: 'Lamine', title: 'lutteur · écurie Teranga', role: 'wrestler', hub: 'pikine', anchor: 'arena', ox: 3, oz: -2, outfit: { top: 0x4e2e1c, bottom: 0xd9322b, skin: 0x4e2e1c } },
  { female: true, id: 'adja', name: 'Adja', title: 'commerçante à Sandaga', role: 'employer', hub: 'plateau', anchor: 'market', ox: 3, oz: 1, outfit: { top: 0x7a5fd1, bottom: 0x7a5fd1, skin: 0x6b3f25, long: true, hat: 0x7a5fd1 } },
  { female: true, id: 'fatou', name: 'Fatou', title: 'gargote Chez Fatou', role: 'vendor', hub: 'plateau', anchor: 'gargote', ox: 4, oz: 0, outfit: { top: 0xc2417f, bottom: 0xc2417f, skin: 0x8a5a3a, long: true } },
  { id: 'moussa', name: 'Moussa', title: 'coach sportif', role: 'coach', hub: 'corniche', anchor: 'gym', ox: 5, oz: 3, outfit: { top: 0xd9482b, bottom: 0x2b2b33, skin: 0x5b3420 } },
  { female: true, id: 'aida', name: 'Aïda', title: 'étudiante, café Touba', role: 'vendor', hub: 'corniche', anchor: 'cafe', ox: 4, oz: 0, outfit: { top: 0x2f8fd1, bottom: 0x2b3a55, skin: 0x7a4a2c } },
  { id: 'ousmane', name: 'Ousmane', title: 'chef de quai', role: 'employer', hub: 'almadies', anchor: 'port', ox: 4, oz: 1, outfit: { top: 0xe7b82f, bottom: 0x2b3a55, skin: 0x4e2e1c, hat: 0x1e6fd9 } },
  { female: true, id: 'khady', name: 'Khady', title: 'gérante du Pointe', role: 'employer', hub: 'almadies', anchor: 'restaurant', ox: 4, oz: 0, outfit: { top: 0xf3f0ea, bottom: 0x0c4a6e, skin: 0x6b3f25 } },
  // Added with the NPC life lane (8 Oct 2026) — BROUILLON, à relire par Habib. Places already exist in src/world/city.ts.
  { id: 'mamadou', name: 'Mamadou Diallo', title: 'Boutique Diallo', role: 'vendor', hub: 'pikine', anchor: 'city:boutique', ox: -4, oz: -5.6, outfit: { top: 0x27407a, bottom: 0x27407a, skin: 0x6b3f25, long: true, hat: 0xf2f2ec } },
  { female: true, id: 'kadiatou', name: 'Kadiatou Diallo', title: 'étudiante · Fann', role: 'neighbour', hub: 'corniche', anchor: 'city:square', ox: -21.5, oz: 4.3, outfit: { top: 0x1f7a44, bottom: 0x1f7a44, skin: 0x7a4a2c } },
  { female: true, id: 'ndeye', name: 'Ndeye Sène', title: 'Atelier Ndeye · couture', role: 'vendor', hub: 'plateau', anchor: 'city:boutique', ox: -4, oz: -5.6, outfit: { top: 0x6b3fa0, bottom: 0x6b3fa0, skin: 0x5b3420 } },
];

export const castById = (id: string) => CAST.find(c => c.id === id);

/** Starting NPC–NPC relationships (draft). Level: -100 rival … 100 close friend. */
export const START_LINKS: [string, string, number, string][] = [
  ['ibou', 'modou', 70, 'amis d’enfance'],
  ['ibou', 'ablaye', 60, 'vieux amis du quartier'],
  ['ibou', 'ousmane', 45, 'cousins'],
  ['mame', 'babacar', 50, 'elle nourrit l’écurie'],
  ['ablaye', 'babacar', 65, 'coach et élève'],
  ['ablaye', 'lamine', -35, 'écuries rivales'],
  ['babacar', 'lamine', -55, 'rivaux'],
  ['ablaye', 'moussa', 40, 'se respectent'],
  ['adja', 'fatou', 55, 'amies de Sandaga'],
  ['ousmane', 'khady', 40, 'il fournit son poisson'],
  ['aida', 'moussa', 30, 'elle court avec son groupe'],
  // NPC life lane (brouillon, à relire)
  ['mamadou', 'kadiatou', 70, 'oncle et nièce'],
  ['ibou', 'mamadou', 55, 'compagnons d’attaya'],
  ['mamadou', 'mame', 35, 'il lui livre le riz'],
  ['kadiatou', 'aida', 45, 'révisent ensemble à Fann'],
  ['ndeye', 'adja', 50, 'le tissu vient de Sandaga'],
  ['ndeye', 'fatou', 35, 'voisines de la Médina'],
  ['babacar', 'modou', 35, 'ancien apprenti du garage'],
  ['khady', 'adja', 25, 'nappes du restaurant'],
];
