import type { GameState } from '../core/state';
import type { HubId } from '../core/types';
import { STARTER_HOME } from '../core/save';
import { fcfaText } from './format';
import { assetsOf } from './assets';
import { counterLine } from './jobs';
import { VEHICLE_ASSETS, parked } from '../transport/owned';
import type { Step } from './progress';

/**
 * « Coups de pouce » (1.0.1): a one-time ladder of free money that walks a new player through the game, fast at the start (10 000 F for the
 * first Tiak Tiak delivery) and rising step by step. Pure rules, unit-tested (tests/pouce.test.ts); the HUD notice, the goal line and the phone's
 * list are in src/economy/pouceModule.ts, src/social/beats.ts and src/ui/phone/apps/work.ts. The figures and the comparison with work are in
 * docs/release/BALANCE-1.0.1-coups-de-pouce.md.
 *
 * - Each step is a first time in the real game, read from the save (`done`): a counter the game already keeps, or one this release adds where
 *   the event happens (a delivery between districts, a vehicle found with « Mes véhicules », a Teranga Money send or withdrawal the server
 *   confirmed). So a step the player already did before 1.0.1 is credited the first time it is seen, and a repeated event is the same state.
 * - Paid ONCE per save, by step id: `pouce:<id>` in `counters` (kept by every client, older ones too) is written in the same synchronous step as
 *   the wallet line, then the game saves. A step already marked is never paid again: after a reload, a district change, a sale and a re-purchase,
 *   a repeated event. Several steps found at once (an older save) are paid together, one wallet line each, one notice.
 * - No step is met by an action that pays more than it costs and can be undone: work, a meal, a match, finding a parked vehicle cost or pay
 *   nothing back; furniture cannot be resold; a home bought loses 10 % at once on resale; the F2's lease costs its first month (60 000 F), more
 *   than its step pays. A rental by the day (handed back at once for almost nothing) does not count.
 * - The steps that need the network (Teranga Money, the Grand Camp) are met offline too (a deposit at the Banque Teranga, a neighbourhood match on
 *   the same pitch), and any step done early is paid at once: the ladder never stalls. The goal line shows the first step not yet done.
 */
export interface PouceStep {
  id: string;
  /** What the player did, for the wallet line and the notice (« Ta première livraison Tiak Tiak »). */
  label: string;
  amount: number;
  /** The goal line's words, where to do it (`hub`: the district the player is in). */
  hint: (s: GameState, hub: HubId) => string;
  /** Met: read from the save only. */
  done: (s: GameState) => boolean;
  /** The step's network part, and what does it offline (the phone's list says both). */
  online?: string;
}

const c = (s: GameState, k: string) => s.data.counters[k] ?? 0;
const homes = (s: GameState) => assetsOf(s, 'home').filter(a => a.spec !== STARTER_HOME);

/** Counters this release adds where the event happens (src/economy/jobs.ts, src/main.ts, src/economy/money.ts); the camp's is for the Grand Camp's screens. */
export const POUCE_COUNTERS = {
  /** A delivery handed over in another district than its pick-up's. */
  away: 'livraisons:quartiers',
  /** A parked vehicle reached, or got on, while the marker « Localiser » put on it was set. */
  found: 'vehicule:retrouve',
  /** A Teranga Money send to another player, a withdrawal to the wallet: counted on the server's yes only. */
  sent: 'teranga:envois', cashed: 'teranga:retraits',
  /** A Grand Camp joined (the server's yes): for the Grand Camp's screens to count (not in this build). */
  camp: 'camp:matchs',
} as const;

export const POUCE: readonly PouceStep[] = [
  { id: 'livraison', label: 'Ta première livraison Tiak Tiak', amount: 10_000,
    hint: (_s, hub) => `ta première livraison Tiak Tiak${counterLine(hub) ? `, à ${counterLine(hub)}` : ''}`,
    done: s => c(s, 'livraisons') >= 1 },
  { id: 'meuble', label: 'Un premier meuble chez toi', amount: 15_000,
    hint: () => 'un premier meuble chez toi (Keur Meubles, ou téléphone › Maison › Commander)',
    done: s => assetsOf(s, 'furniture').length > 0 },
  { id: 'vehicule', label: 'Un véhicule retrouvé avec « Mes véhicules »', amount: 20_000,
    hint: s => (VEHICLE_ASSETS.some(a => parked(s.data, a)) ? 'retrouve ton véhicule garé : téléphone › Mes véhicules › Localiser' : 'monte sur une moto Tiak Tiak, gare-la, puis retrouve-la avec « Mes véhicules »'),
    done: s => c(s, POUCE_COUNTERS.found) >= 1 },
  { id: 'quartiers', label: 'Une livraison vers un autre quartier', amount: 25_000,
    hint: () => 'une livraison Tiak Tiak vers un autre quartier (de 2 500 à 10 000 F la course)',
    done: s => c(s, POUCE_COUNTERS.away) >= 1 },
  { id: 'soiree', label: 'Un repas ou une soirée dans un lieu vivant', amount: 30_000,
    hint: () => 'un repas au Toit Baobab (Plateau) ou à la Terrasse de Ngor, ou une soirée au Patio (Almadies)',
    done: s => c(s, 'terrasse') >= 1 || Object.entries(s.data.counters).some(([k, v]) => v > 0 && /^club:.+:(soirees|nuit)$/.test(k)) },
  { id: 'teranga', label: 'Un envoi ou un retrait Teranga Money', amount: 35_000, online: 'sans réseau : un premier dépôt à la Banque Teranga',
    hint: () => 'un envoi ou un retrait Teranga Money (ou, sans réseau, un dépôt à la Banque Teranga)',
    done: s => c(s, POUCE_COUNTERS.sent) >= 1 || c(s, POUCE_COUNTERS.cashed) >= 1 || s.data.bank.opened >= 0 },
  { id: 'logement', label: 'Locataire au mois ou propriétaire', amount: 45_000,
    hint: () => 'loue le F2 au mois (Résidence Jàmm) ou achète un logement',
    done: s => homes(s).some(a => a.how === 'owned' || !!a.lease) },
  { id: 'camp', label: 'Un match au terrain de la Corniche', amount: 50_000, online: 'sans réseau : un match de quartier au même terrain',
    hint: () => 'un match au terrain de la Corniche (un Grand Camp, ou un match de quartier)',
    done: s => c(s, 'ft_matches') >= 1 || c(s, POUCE_COUNTERS.camp) >= 1 },
  { id: 'location', label: 'Un logement mis en location', amount: 70_000,
    hint: s => (homes(s).some(a => a.how === 'owned' || a.lease) ? 'mets un logement en location (sa fiche, dans « Biens »)' : 'mets un logement en location : loue d’abord le F2, ou achète'),
    done: s => homes(s).some(a => (a.how === 'owned' && a.leased) || (!!a.lease && a.lease.mode !== 'live')) },
];
/** The whole ladder (F). */
export const POUCE_TOTAL = POUCE.reduce((t, p) => t + p.amount, 0);

const KEY = (id: string) => `pouce:${id}`;
/** Paid already (in this save). */
export const paid = (s: GameState, id: string) => c(s, KEY(id)) > 0;
/** Met and not paid yet. */
export const due = (s: GameState) => POUCE.filter(p => !paid(s, p.id) && p.done(s));
/** The next step: the first neither paid nor met (null: the ladder is done). */
export const nextStep = (s: GameState) => POUCE.find(p => !paid(s, p.id) && !p.done(s)) ?? null;
/** What the ladder has paid so far. */
export const received = (s: GameState) => POUCE.reduce((t, p) => t + (paid(s, p.id) ? c(s, KEY(p.id)) : 0), 0);

export interface Payment { step: PouceStep; amount: number }
/**
 * Pays every step met and not paid yet: for each, its mark (`pouce:<id>` = the amount) and its wallet line (« Coup de pouce : … ») in the same
 * synchronous step. The caller saves at once. Calling it again (another frame, a repeated event, after a reload) pays nothing more.
 */
export function payDue(s: GameState): Payment[] {
  const out: Payment[] = [];
  for (const p of due(s)) {
    s.data.counters[KEY(p.id)] = p.amount;
    s.addMoney(p.amount, `Coup de pouce : ${p.label}`);
    out.push({ step: p, amount: p.amount });
  }
  return out;
}

const bonus = (p: PouceStep) => `Coup de pouce +${fcfaText(p.amount)}`;
/**
 * The goal line's lead for the next step (src/social/beats.ts `leads`), or null when the ladder is done. The first delivery keeps the id of the
 * first Tiak Tiak job (`goal_tiak`: the way-finding pin to the nearest pick-up, the job's gold star); the others are `pouce_<id>`.
 */
export function pouceLead(s: GameState, hub: HubId): Step | null {
  const p = nextStep(s); if (!p) return null;
  return { id: p.id === 'livraison' ? 'goal_tiak' : `pouce_${p.id}`, hint: `${bonus(p)} : ${p.hint(s, hub)}` };
}

/** The phone's list: each step with its amount and whether it is paid, the next one, what was received. */
export function ladderView(s: GameState, hub: HubId) {
  const next = nextStep(s);
  return {
    steps: POUCE.map(p => ({ id: p.id, label: p.label, amount: p.amount, paid: paid(s, p.id), next: p === next, online: p.online ?? null })),
    next: next ? { id: next.id, label: next.label, amount: next.amount, hint: next.hint(s, hub) } : null,
    done: POUCE.filter(p => paid(s, p.id)).length, count: POUCE.length, received: received(s), total: POUCE_TOTAL,
  };
}
