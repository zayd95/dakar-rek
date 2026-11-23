import type { GameState } from '../core/state';
import type { AssetState } from '../core/types';
import { STARTER_HOME } from '../core/save';
import { ECONOMY } from './config';
import { fcfaText } from './format';
import { furnitureSpec, homeSpec, specOf } from './catalog';
import {
  assetByUid, cannotLet, cannotMoveIn, cannotReturnRoom, cannotSell, chargeOf, currentHome, endLease, furnitureIn, incomeOf, moveIn, rentOf, returnRoom,
  roomReturned, saleValue, sellAsset, setLeased, touchAssets,
} from './assets';
import { cannotEndNow, cannotOffer, endNow, furnished, offer, termsOf } from './monthly';

/**
 * Becoming an owner or a tenant (1.0.1, docs/OWNERSHIP.md « The purchase sequence »): a home bought, rented or signed for is the player's at once
 * (src/economy/assets.ts, monthly.ts); « Emménager » moves in (`moveIn`: the furniture follows) and the home that was lived in gets ONE choice,
 * with its money, never a silent default:
 *   - the family room (starter): keep it as a family room (free, the default) or give it back to the family;
 *   - a rented home: hand the keys back (the rent stops), keep the lease (the rent goes on), or, for a monthly contract, sublet it (the F2 tenant
 *     model of src/economy/monthly.ts: occupancy never guaranteed);
 *   - an owned home: let it (the existing letting), sell it (its resale value at once), or keep it empty (its upkeep goes on).
 * Pure logic, unit-tested (tests/moving.test.ts); the sheets are in src/economy/estate.ts.
 *
 * - The move and the choice are one step (`moveAndLeave`): every check is made first, so a refused choice never leaves half a move.
 * - Nothing is lost: the furniture goes where the player lives (moveIn, endLease, sellAsset), and every choice can be changed later from the
 *   home's sheet (« Biens », « Maison »).
 * - The question about a home is put to the player once: `logement:<uid>` in `flags` (story flags, kept by every client, older ones too). A save
 *   from before 1.0.1 that holds another home gets its question the next time that home's sheet is opened (`question`), never at load.
 */
export type LeaveChoice = 'keep_room' | 'return_room' | 'end_lease' | 'keep_lease' | 'sublet' | 'let' | 'sell' | 'keep_empty';
export interface LeaveOption {
  id: LeaveChoice; icon: string; label: string; detail: string;
  /** The money, in the sheet's right column (« +13 500 000 F », « −16 700 F / jour », « gratuit »). */
  right: string;
  /** Why it cannot be chosen now (null: it can). */
  why: string | null;
  /** The choice nothing else would change (the family room kept). */
  preset?: boolean;
}

const ASKED = 'logement:';
/** The question about this home was put to the player (at its purchase, or once on its sheet for an older save). */
export const asked = (s: GameState, uid: string) => s.data.flags.includes(ASKED + uid);
export function markAsked(s: GameState, uid: string) { if (!asked(s, uid)) s.data.flags.push(ASKED + uid); }
/** Forgets the marks of homes the player no longer holds (sold, keys handed back): uids are never given twice, so this only keeps `flags` short. */
export function forgetGone(s: GameState) {
  const held = new Set(s.data.assets.list.map(a => a.uid));
  const kept = s.data.flags.filter(f => !f.startsWith(ASKED) || held.has(f.slice(ASKED.length)));
  if (kept.length !== s.data.flags.length) s.data.flags = kept;
}

const name = (a: AssetState) => (specOf(a.spec)?.name ?? '').split(' · ')[0];
const perDay = (n: number) => `${fcfaText(n)} / jour`;
const perMonth = (n: number) => `${fcfaText(n)} / mois`;
/** The pieces that follow the player out of `from` (moveIn): not the fixed ones (on the family bed), not a furnishing pack (it stays with its home). */
export const followers = (s: GameState, from: AssetState) => furnitureIn(s, from.uid).filter(f => !furnitureSpec(f.spec)!.fixed && !from.lease?.pack?.includes(f.uid));

/** Reads the rules as if the player already lived in `uid` (the choices about the home being left are made before the move happens). */
function asIf<T>(s: GameState, uid: string | null, fn: () => T): T {
  const st = s.data.assets, was = st.home;
  st.home = uid;
  try { return fn(); } finally { st.home = was; }
}

/**
 * The choices for `from`, a home the player leaves (or no longer lives in), with what each costs or brings. `livingIn`: where the player will live
 * (the home being moved into); by default where they live now.
 */
export function leaveOptions(s: GameState, from: AssetState, livingIn: string | null = s.data.assets.home): LeaveOption[] {
  const sp = homeSpec(from.spec); if (!sp || from.uid === livingIn) return [];
  return asIf(s, livingIn, () => {
    if (from.spec === STARTER_HOME) {
      if (roomReturned(s)) return [];
      return [
        { id: 'keep_room', icon: '🏠', label: 'Garder comme chambre familiale', detail: 'La famille te la garde, sans loyer : tu peux y revenir quand tu veux', right: 'gratuit', why: null, preset: true },
        { id: 'return_room', icon: '🤲', label: 'La rendre à la famille', detail: 'Elle redevient la leur ; tu pourras la redemander depuis sa fiche', right: '0 F', why: cannotReturnRoom(s) },
      ];
    }
    if (from.how === 'rented') {
      const L = from.lease, t = termsOf(from.spec);
      if (L) {
        const out: LeaveOption[] = [
          { id: 'end_lease', icon: '🗝️', label: 'Rendre les clés', detail: 'Le bail s’arrête : le mois payé n’est pas remboursé ; tes meubles te suivent', right: perMonth(0), why: cannotEndNow(s, from.uid) },
          { id: 'keep_lease', icon: '📝', label: 'Garder la location', detail: `Le bail continue : ${fcfaText(L.rent)} + ${fcfaText(L.charges)} de charges chaque mois`, right: '−' + perMonth(L.rent + L.charges), why: null },
        ];
        if (t) {
          const mode = furnished(s, from) ? 'furnished' : 'sublet', max = mode === 'furnished' ? t.furnished : t.sublet;
          out.push({ id: 'sublet', icon: '💼', label: mode === 'furnished' ? 'Sous-louer meublé' : 'Sous-louer', detail: `Un locataire de la ville · ${Math.round((1 - ECONOMY.monthly.vacancy) * (ECONOMY.monthly.occMin + ECONOMY.monthly.occMax) / 2)} % d’occupation en moyenne, jamais garanti · ton loyer continue`,
            right: `jusqu’à +${perMonth(max)}`, why: cannotOffer(s, from.uid, mode) });
        }
        return out;
      }
      const rent = rentOf(from);
      return [
        { id: 'end_lease', icon: '🗝️', label: 'Rendre les clés', detail: `Le loyer de ${perDay(rent)} s’arrête ; tes meubles te suivent`, right: perDay(0), why: null },
        { id: 'keep_lease', icon: '📝', label: 'Garder la location', detail: `Le loyer continue : ${fcfaText(Math.round(rent / 24))} chaque heure en ville, pendant que tu joues`, right: '−' + perDay(rent), why: null },
      ];
    }
    if (from.how !== 'owned') return [];
    const income = Math.round((sp.income ?? 0) * from.upgrades.reduce((m, u) => m * (sp.upgrades?.find(x => x.id === u)?.rentMult ?? 1), 1)), upkeep = chargeOf(from);
    return [
      { id: 'let', icon: '💼', label: 'Mettre en location', detail: 'Loué à une famille : payé chaque heure en ville, pendant que tu joues', right: `+${fcfaText(income)} / h`, why: from.leased ? null : cannotLet(s, from.uid) },
      { id: 'sell', icon: '💰', label: 'Vendre', detail: `Payé tout de suite : ${Math.round(ECONOMY.property.saleShare * 100)} % de sa valeur ; tes meubles te suivent`, right: '+' + fcfaText(saleValue(from)), why: cannotSell(s, from.uid) },
      { id: 'keep_empty', icon: '🔒', label: 'Garder vide', detail: upkeep ? `Il reste à toi, vide : ses charges continuent, ${fcfaText(upkeep)} chaque heure en ville` : 'Il reste à toi, vide : il ne coûte rien', right: upkeep ? `−${fcfaText(upkeep)} / h` : '0 F / h', why: null },
    ];
  });
}

/** Applies a choice to a home the player does not live in. The money it brought (a sale), or null when it could not be applied. */
function apply(s: GameState, from: AssetState, choice: LeaveChoice): number | null {
  switch (choice) {
    case 'keep_room': case 'keep_lease': case 'keep_empty': return 0;
    case 'return_room': return returnRoom(s) ? 0 : null;
    case 'end_lease': return (from.lease ? endNow(s, from.uid) : endLease(s, from.uid)) ? 0 : null;
    case 'sublet': return offer(s, from.uid, furnished(s, from) ? 'furnished' : 'sublet') ? 0 : null;
    case 'let': return from.leased || setLeased(s, from.uid, true) ? 0 : null;
    case 'sell': { const got = sellAsset(s, from.uid); return got > 0 ? got : null; }
  }
}

export interface MoveResult {
  /** The home moved into, the one left (as it was at the move: it may have been sold or handed back since). */
  to: AssetState; from: AssetState; fromName: string;
  choice: LeaveChoice;
  /** Pieces of furniture that followed the player. */
  moved: number;
  /** Money the choice brought (a sale). */
  money: number;
}
export function cannotMoveAndLeave(s: GameState, toUid: string, choice: LeaveChoice): string | null {
  const why = cannotMoveIn(s, toUid); if (why) return why;
  const opt = leaveOptions(s, currentHome(s), toUid).find(o => o.id === choice);
  return !opt ? 'Ce choix ne vaut pas pour ce logement' : opt.why;
}
/**
 * « Emménager »: live in `toUid` from now on (the furniture follows, as `moveIn` does) and decide the home left with `choice`, in one step. Every
 * check is made first; null when anything refuses (nothing has changed then). Both homes are marked as asked.
 */
export function moveAndLeave(s: GameState, toUid: string, choice: LeaveChoice): MoveResult | null {
  if (cannotMoveAndLeave(s, toUid, choice)) return null;
  const from = currentHome(s), to = assetByUid(s, toUid)!, moved = followers(s, from).length, fromName = name(from);
  if (!moveIn(s, toUid, true)) return null;
  const money = apply(s, from, choice) ?? 0;
  markAsked(s, toUid); markAsked(s, from.uid);
  touchAssets();
  return { to, from, fromName, choice, moved, money };
}
/** The one question about a home the player does not live in, answered without moving: let, sell, keep, hand back… Null when it cannot be applied. */
export function decide(s: GameState, uid: string, choice: LeaveChoice): number | null {
  const a = assetByUid(s, uid); if (!a || s.data.assets.home === uid) return null;
  const opt = leaveOptions(s, a).find(o => o.id === choice);
  if (!opt || opt.why) return null;
  markAsked(s, uid);
  const got = apply(s, a, choice);
  touchAssets();
  return got;
}

/**
 * The question a home's sheet puts once (a save from before 1.0.1, or a home whose purchase sequence never showed): 'move' (« Emménager
 * maintenant ? »: the player still lives in the family room), 'leave' (what to do with a home the player does not live in), or null (already
 * asked, lived in, already let or on offer: nothing left undecided).
 */
export function question(s: GameState, a: AssetState): 'move' | 'leave' | null {
  if (!homeSpec(a.spec) || asked(s, a.uid) || s.data.assets.home === a.uid) return null;
  if (a.spec === STARTER_HOME) return roomReturned(s) ? null : 'leave';
  if (a.how === 'owned' && a.leased) return null;
  if (a.lease && a.lease.mode !== 'live') return null;
  if (a.how !== 'owned' && a.how !== 'rented') return null;
  return currentHome(s).spec === STARTER_HOME && !cannotMoveIn(s, a.uid) ? 'move' : 'leave';
}

/** How a home stands for the player, in a few words (the sheets of the sequence): « à toi », « loué par toi · 16 700 F / jour »… */
export function standing(s: GameState, a: AssetState): string {
  if (a.spec === STARTER_HOME) return roomReturned(s) ? 'rendue à la famille' : 'prêtée par la famille, sans loyer';
  if (a.lease) return `bail au mois · ${perMonth(a.lease.rent + a.lease.charges)}`;
  if (a.how === 'rented') return `loué par toi · ${perDay(rentOf(a))}`;
  return a.leased ? `à toi · loué +${fcfaText(Math.round(incomeOf(s, a)))} / h` : 'à toi';
}
