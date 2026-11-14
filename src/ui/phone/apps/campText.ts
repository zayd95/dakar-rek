import type { HubId } from '../../../core/types';
import { fcfaText } from '../../../economy/format';
import type { Tag } from '../../../online/protocol';
import { campRefusalText, type CampMoneyView, type CampStatus } from '../../../online/campClient';
import {
  CAMP_FEE_CHIPS, CAMP_FEE_DEFAULT, CAMP_FEE_MAX, CAMP_MATCH, campFullPool, campWinnerShare, isCampFee, isMatchId,
  type CampDist, type CampEvent, type CampListing, type CampLobbyView, type CampPlayer, type CampResult, type CampSize, type CampTerms,
} from '../../../multiplayer/campProtocol';

/**
 * 1.0.1 Grand Camp (docs/release/GRAND-CAMP-RULES-1.0.1.md): the words and the rules of the phone's screens (src/ui/phone/apps/camp.ts) and of the
 * match's band in the street (src/game/grandCamp.ts), pure so the tests read them (tests/campText.test.ts): the organizer's form → the terms, the live
 * summary, what each button of a lobby says and whether it can be pressed now, each money step as the server has said it, the result, the moments of
 * a match, and the invitation that travels as an ordinary text message (a 1.0 client reads it as text; a 1.0.1 client shows « Voir le match »).
 * Nothing here moves money or decides anything: the server does (src/online/campClient.ts says what it answered).
 */
export const F = fcfaText;
/** Where every Grand Camp is played: the Corniche's football pitch (the only pitch of the city, src/world/builder.ts special 'pitch'). */
export const CAMP_HUB: HubId = 'corniche';
export const CAMP_PLACE = 'Terrain de foot · Corniche';
export const TEAM_COLORS: readonly [number, number] = [0xc8302a, 0xf2c12e];

// ------------------------------------------------------------------ the organizer's form
/** The form as the phone keeps it while it is filled: a fee chip or a typed amount, the size, the distribution, public or private. */
export interface CampForm { fee: number; typed: string; size: CampSize; dist: CampDist; open: boolean }
export const campFormDefault = (): CampForm => ({ fee: CAMP_FEE_DEFAULT, typed: '', size: 10, dist: 'team', open: true });
export const FEE_CHIPS: readonly number[] = CAMP_FEE_CHIPS;
export const feeLabel = (fee: number) => (fee === 0 ? 'Gratuit' : F(fee));
export const sizeLabel = (n: CampSize) => `${n / 2} contre ${n / 2}`;
export const DIST_LABEL: Record<CampDist, string> = { team: 'Équipe gagnante — partage égal', single: 'Un seul gagnant' };

/** A typed fee (« 1 500 », « 1500 F », « 1.500 », « 0 »): whole francs from 0 (a free match) to one ledger operation; null when it is not one. */
export function parseFee(text: string): number | null {
  const t = text.replace(/[\s  .]/g, '').replace(/(f|fcfa)$/i, '');
  if (!/^\d{1,7}$/.test(t)) return null;
  const n = Number(t);
  return isCampFee(n) ? n : null;
}
/** The fee the form holds now: the typed amount when one is typed, else the chip; or why not (the sentence under the field). */
export function formFee(f: CampForm): { ok: true; fee: number } | { ok: false; why: string } {
  if (!f.typed.trim()) return { ok: true, fee: f.fee };
  const n = parseFee(f.typed);
  if (n !== null) return { ok: true, fee: n };
  return { ok: false, why: /\d/.test(f.typed) && Number(f.typed.replace(/\D/g, '')) > CAMP_FEE_MAX ? `Au plus ${F(CAMP_FEE_MAX)} par joueur.` : 'Un montant en francs, sans centimes.' };
}
/** The terms the form makes, or why it cannot be sent yet. Every match is organized at the Corniche's pitch. */
export function formTerms(f: CampForm, hub: HubId = CAMP_HUB): { ok: true; terms: CampTerms } | { ok: false; why: string } {
  const fee = formFee(f);
  return fee.ok ? { ok: true, terms: { fee: fee.fee, size: f.size, dist: f.dist, open: f.open, hub } } : fee;
}
/**
 * The live summary under the form (and on a listing, in a lobby): the pool if every place is filled, what one winner gets, no commission. The owner's
 * words: « Cagnotte totale si tous les joueurs participent : 10 000 F », « Gain par gagnant : 2 000 F », « Sans commission ».
 */
export function campSummary(t: Pick<CampTerms, 'fee' | 'size' | 'dist'>): string[] {
  if (t.fee === 0) return ['Match gratuit : pas de mise, pas de cagnotte', 'Sans commission'];
  return [
    `Cagnotte totale si tous les joueurs participent : ${F(campFullPool(t))}`,
    t.dist === 'team' ? `Gain par gagnant : ${F(campWinnerShare(t))}` : `Gain du gagnant : ${F(campWinnerShare(t))}`,
    'Sans commission',
  ];
}
/** One line of a match's terms: « Mise 1 000 F · 5 contre 5 · partage égal · privé ». */
export function termsLine(t: CampTerms): string {
  return [t.fee ? `Mise ${F(t.fee)}` : 'Gratuit', sizeLabel(t.size), t.dist === 'team' ? 'partage égal' : 'un seul gagnant', t.open ? 'public' : 'privé'].join(' · ');
}
/** What a player reads before accepting: the fee and when it is taken or given back, the distribution, a draw, public or private. */
export function rulesLines(t: CampTerms): string[] {
  const out: string[] = [];
  if (t.fee > 0) {
    out.push(`Ta mise de ${F(t.fee)} est prise quand tu appuies sur « Prêt » (Teranga Money d’abord), et rendue si tu te retires avant le coup d’envoi.`);
    out.push(t.dist === 'team' ? `L’équipe gagnante se partage la cagnotte : ${F(campWinnerShare(t))} chacun si le match est complet.`
      : 'Un seul gagnant : le meilleur buteur de l’équipe gagnante prend toute la cagnotte (à égalité, le premier à avoir marqué).');
    out.push('Match nul : chaque mise est rendue.');
  } else out.push('Match gratuit : rien n’est pris, rien n’est gagné.');
  out.push(`Premier à ${CAMP_MATCH.goals} buts, ${Math.round(CAMP_MATCH.seconds / 60)} minutes au plus, au terrain de la Corniche.`);
  out.push(t.open ? 'Public : ouvert à tous les joueurs du quartier.' : 'Privé : sur invitation de l’organisateur.');
  return out;
}

// ------------------------------------------------------------------ the district's matches
export interface ListingView { title: string; sub: string; badge: string | null; places: string }
export function listingView(l: CampListing): ListingView {
  return {
    title: `Grand Camp de ${l.org.name}`, sub: termsLine(l.terms), places: `${l.count}/${l.terms.size} joueurs`,
    badge: l.invited ? 'Tu es invité' : !l.terms.open ? 'Privé' : null,
  };
}

// ------------------------------------------------------------------ a lobby's buttons
export type CampActId = 'join' | 'team' | 'ready' | 'unready' | 'go' | 'leave' | 'invite' | 'remove' | 'cancel' | 'rename' | 'play' | 'abandon';
export interface CampAct {
  id: CampActId; label: string; kind: 'primary' | 'secondary' | 'danger' | 'quiet'; sub?: string;
  /** Set: shown greyed, with this sentence (why it cannot be pressed now). */
  why?: string;
}
export interface LobbyCtx {
  lobby: CampLobbyView;
  me: Tag | null;
  status: CampStatus;
  /** Already in another Grand Camp (one lobby, one match at a time). */
  elsewhere?: boolean;
  /** At the Corniche's pitch now (« Prêt » needs it: no free teleport). */
  atPitch: boolean;
  /** A request of this screen still waits for the server's answer (no second tap meanwhile). */
  busy?: boolean;
}
export const seatOf = (l: CampLobbyView, me: Tag | null): CampPlayer | null => (me ? l.players.find(p => p.tag === me) ?? null : null);
const count = (l: CampLobbyView, team: 0 | 1) => l.players.filter(p => p.team === team).length;
/**
 * The buttons a lobby shows me now, in order, each with why it cannot be pressed when it cannot. The server decides every one of them again (an
 * answer can still be no): this only keeps a player from pressing what would surely be refused, and says why in words.
 */
export function lobbyActions(c: LobbyCtx): CampAct[] {
  const l = c.lobby, seat = seatOf(l, c.me), fee = l.terms.fee, org = !!c.me && l.org === c.me;
  const out: CampAct[] = [];
  if (l.state === 'over') return out;
  if (l.state === 'play') {
    if (seat && !seat.gone) out.push({ id: 'play', label: 'Retour au terrain', kind: 'primary' }, { id: 'abandon', label: 'Quitter le match', kind: 'quiet', sub: 'Tu suivras le résultat de ton équipe' });
    return gate(out, c);
  }
  if (!seat) {
    const full = l.players.length >= l.terms.size;
    out.push({ id: 'join', label: 'Rejoindre', kind: 'primary', sub: fee ? `Mise ${F(fee)}, prise seulement à « Prêt »` : 'Match gratuit',
      ...(c.elsewhere ? { why: 'Tu es déjà inscrit à un autre Grand Camp.' } : full ? { why: 'Le match est complet.' } : {}) });
    return gate(out, c);
  }
  const pending = seat.hold === 'pending', ready = seat.ready || seat.hold === 'held';
  if (pending) out.push({ id: 'ready', label: 'Mise en attente…', kind: 'primary', why: 'En attente de la réponse du serveur.' });
  else if (ready) out.push({ id: 'unready', label: 'Pas prêt', kind: 'secondary', ...(fee ? { sub: `Ta mise de ${F(fee)} t’est rendue` } : {}) });
  else if (!c.atPitch) out.push({ id: 'go', label: 'Aller au terrain', kind: 'primary', sub: CAMP_PLACE }, { id: 'ready', label: 'Prêt', kind: 'secondary', why: 'Va d’abord au terrain de la Corniche.' });
  else out.push({ id: 'ready', label: 'Prêt', kind: 'primary', sub: fee ? `Ta mise de ${F(fee)} sera prise` : 'Match gratuit' });
  const other = seat.team === 0 ? 1 : 0;
  out.push({ id: 'team', label: `Changer d’équipe`, kind: 'secondary', sub: `Passer chez les ${l.teams[other]}`,
    ...(pending || ready ? { why: 'Passe « Pas prêt » d’abord.' } : count(l, other) >= l.terms.size / 2 ? { why: `Les ${l.teams[other]} sont au complet.` } : {}) });
  if (org) {
    out.push({ id: 'invite', label: 'Inviter', kind: 'secondary', sub: 'Tes amis de Messages, les joueurs autour' });
    out.push({ id: 'remove', label: 'Retirer un joueur', kind: 'secondary', ...(l.players.length < 2 ? { why: 'Personne à retirer.' } : {}) });
    out.push({ id: 'cancel', label: 'Annuler le match', kind: 'danger', ...(l.pool > 0 ? { sub: 'Chaque mise est rendue' } : {}) });
  }
  out.push({ id: 'leave', label: 'Quitter', kind: 'quiet', ...(seat.hold !== 'none' && fee ? { sub: `Ta mise de ${F(fee)} t’est rendue` } : {}) });
  return gate(out, c);
}
/** Offline or waiting: nothing that talks to the server can be pressed (« Aller au terrain » can). */
function gate(list: CampAct[], c: LobbyCtx): CampAct[] {
  const why = c.status !== 'open' ? (c.status === 'reconnecting' || c.status === 'connecting' ? 'Reconnexion…' : 'Hors ligne pour l’instant.') : c.busy ? 'En attente du serveur…' : null;
  return why ? list.map(a => (a.id === 'go' || a.id === 'play' || a.why ? a : { ...a, why })) : list;
}

// ------------------------------------------------------------------ money, as the server has said it
export interface MoneyLine { text: string; tone: 'wait' | 'ok' | 'warn' }
const WHY: Record<string, string> = { unready: '« Pas prêt »', leave: 'tu as quitté', drop: 'connexion perdue avant le coup d’envoi', removed: 'retiré par l’organisateur' };
/** One money step of mine in words: pending until the server answered, then done (with the amount it wrote) or failed (with its reason). */
export function moneyLine(m: CampMoneyView): MoneyLine {
  const amt = F(m.amount);
  if (m.state === 'pending') return { tone: 'wait', text: m.step === 'hold' ? `Mise de ${amt} : en attente du serveur…` : m.step === 'release' ? `Remboursement de ${amt} : en attente du serveur…` : 'En attente du serveur…' };
  if (m.state === 'failed') return { tone: 'warn', text: `${m.step === 'hold' ? 'Mise refusée' : 'Refusé'} : ${m.text ?? campRefusalText(m.reason ?? '')}` };
  switch (m.step) {
    case 'hold': return { tone: 'ok', text: m.amount > 0 ? `Mise prise : ${amt}${m.balance !== undefined ? ` · Teranga Money ${F(m.balance)}` : ''}` : 'Prêt (match gratuit)' };
    case 'release': return { tone: 'ok', text: m.amount > 0 ? `Mise rendue : ${amt}${m.why && WHY[m.why] ? ` (${WHY[m.why]})` : ''}` : 'Rien n’avait été pris' };
    case 'payout': return { tone: 'ok', text: `Gain versé : ${amt}` };
    case 'refund': return { tone: 'ok', text: `Mise remboursée : ${amt}` };
  }
}
/**
 * How the fee would be paid at « Prêt »: Teranga Money first, the rest from the wallet (the account's own top-up first); or why it cannot be (never a
 * negative balance). `tm`: the server's Teranga Money balance (null: unknown, offline); `fundLeft`: what today's top-ups still allow (null: no limit known).
 */
export function feeQuote(fee: number, tm: number | null, wallet: number, fundLeft: number | null = null): { fromOnline: number; fromWallet: number; why?: string } {
  if (fee <= 0) return { fromOnline: 0, fromWallet: 0 };
  if (tm === null) return { fromOnline: 0, fromWallet: 0, why: 'Teranga Money n’est pas connecté : réessaie dans un instant.' };
  const fromOnline = Math.min(fee, Math.max(0, tm)), fromWallet = fee - fromOnline;
  if (fromWallet > wallet) return { fromOnline, fromWallet, why: `Solde insuffisant : il te manque ${F(fromWallet - wallet)}.` };
  if (fundLeft !== null && fromWallet > fundLeft) return { fromOnline, fromWallet, why: campRefusalText('limit-fund') };
  return { fromOnline, fromWallet };
}
export function quoteLine(q: { fromOnline: number; fromWallet: number }): string {
  if (!q.fromOnline && !q.fromWallet) return '';
  if (!q.fromWallet) return `Payée avec Teranga Money : ${F(q.fromOnline)}`;
  return q.fromOnline ? `${F(q.fromOnline)} de Teranga Money + ${F(q.fromWallet)} du portefeuille` : `${F(q.fromWallet)} du portefeuille, par Teranga Money`;
}

// ------------------------------------------------------------------ the match: band, moments, result
/** The clock of the band: elapsed play « 1:05 » (the server's clock, s). */
export function clockText(s: number): string { const t = Math.max(0, Math.floor(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
export function scoreText(teams: readonly [string, string], score: readonly [number, number]): string { return `${teams[0]} ${score[0]} – ${score[1]} ${teams[1]}`; }
export interface Moment { icon: string; title: string; line: string; big: boolean }
/** A match event worth showing (a goal, half time, full time) or saying (a kick-off, a player dropping, coming back, leaving); null: nothing. */
export function momentOf(e: CampEvent, teams: readonly [string, string], name: (sid: number) => string | null, mySid: number | null): Moment | null {
  const sc = e.sc ? scoreText(teams, e.sc) : '';
  switch (e.k) {
    case 'goal': {
      const who = e.who !== undefined ? name(e.who) : null, me = e.who !== undefined && e.who === mySid;
      return { icon: '⚽', big: true, title: me && !e.own ? 'But ! Tu as marqué' : `But des ${teams[e.team ?? 0]} !`, line: [who && !me ? `${who}${e.own ? ' (contre son camp)' : ''}` : me && e.own ? 'Contre ton camp' : '', sc].filter(Boolean).join(' · ') };
    }
    case 'half': return { icon: '⏸️', big: true, title: 'Mi-temps', line: sc };
    case 'full': return { icon: '🏁', big: true, title: 'Fin du match', line: sc };
    case 'kickoff': return e.c === 0 ? { icon: '🟢', big: false, title: 'Coup d’envoi', line: sc } : null;
    case 'drop': { const w = e.who !== undefined ? name(e.who) : null; return w && e.who !== mySid ? { icon: '📶', big: false, title: `${w} a perdu la connexion`, line: 'Sa place l’attend 60 s' } : null; }
    case 'back': { const w = e.who !== undefined ? name(e.who) : null; return w && e.who !== mySid ? { icon: '↩️', big: false, title: `${w} est de retour`, line: '' } : null; }
    case 'gone': { const w = e.who !== undefined ? name(e.who) : null; return w && e.who !== mySid ? { icon: '🚪', big: false, title: `${w} a quitté le match`, line: 'Son équipe joue à un de moins' } : null; }
    default: return null;
  }
}
export interface ResultView { icon: string; title: string; score: string; lines: string[]; tone: 'win' | 'lose' | 'even' | 'wait' }
/**
 * The end as this player is told it: nothing about money before the server's result (written by the ledger) has arrived — « en attente » — then
 * who won, the score, and what came back to me (the payout, or my fee refunded), from the result's own payouts.
 */
export function resultView(r: CampResult | null, o: { me: Tag | null; team: 0 | 1 | null; teams: readonly [string, string]; names?: (tag: Tag) => string | null }): ResultView {
  if (!r) return { icon: '⏳', title: 'Fin du match', score: '', lines: ['Résultat en attente du serveur…', 'Les gains et les remboursements arrivent une fois écrits par le serveur.'], tone: 'wait' };
  const mine = o.me ? r.payouts.find(p => p.tag === o.me)?.amount ?? 0 : 0, sc = scoreText(o.teams, r.score), settled = r.money === 'settled';
  const back = (why: string): ResultView => ({ icon: '🤝', title: why, score: r.end === 'draw' || r.end === 'stopped' ? sc : '', tone: 'even',
    lines: [settled && mine > 0 ? `Ta mise t’est rendue : ${F(mine)}` : r.fee > 0 ? 'Aucune mise n’avait été prise.' : 'Match gratuit : rien à rendre.'] });
  switch (r.end) {
    case 'draw': return back('Match nul');
    case 'cancel': return back('Match annulé');
    case 'empty': return back('Match annulé : plus personne');
    case 'timeout': return back('Match annulé : pas commencé à temps');
    case 'stopped': return back('Match arrêté par le serveur');
    case 'win': {
      const w = r.winner ?? 0, won = o.team === w, single = r.single ? (r.single === o.me ? 'toi' : o.names?.(r.single) ?? 'un joueur') : null;
      const lines: string[] = [];
      if (!settled) lines.push(r.fee > 0 ? 'Aucune mise n’avait été prise.' : 'Match gratuit : pas de gain.');
      else if (mine > 0) lines.push(r.dist === 'single' ? `Tu prends toute la cagnotte : ${F(mine)}` : `Ta part de la cagnotte : ${F(mine)}`);
      else if (won && r.dist === 'single' && single) lines.push(`La cagnotte (${F(r.total)}) va à ${single}, meilleur buteur.`);
      else if (!won && o.team !== null) lines.push(`Ta mise de ${F(r.fee)} va aux gagnants.`);
      return { icon: won ? '🏆' : '⚽', title: o.team === null ? `Victoire des ${o.teams[w]}` : won ? `Victoire ! Les ${o.teams[w]} gagnent` : `Défaite : les ${o.teams[w]} gagnent`, score: sc, lines, tone: won ? 'win' : 'lose' };
    }
  }
}

// ------------------------------------------------------------------ the invitation, as an ordinary text message
const INVITE = /Grand Camp\b[\s\S]*?·\s*match\s+([0-9a-f]{16})\s*$/;
/**
 * The text an invitation sends in the conversation (src/online/client.ts `say`): a 1.0 client reads it as it is; a 1.0.1 client finds the match id at
 * its end and turns it into « Voir le match ». The invitation itself is the server's list (the organizer's `invite`); the text only points to it.
 */
export function campInviteText(t: Pick<CampTerms, 'fee' | 'size'>, match: string): string {
  return `Je t’invite à mon Grand Camp au terrain de la Corniche : ${t.fee ? `mise ${F(t.fee)}` : 'match gratuit'}, ${sizeLabel(t.size)} · match ${match}`;
}
/** An invitation's text: its match, and the words to show (the id put aside). Null for any other text. */
export function parseCampInvite(text: string): { match: string; text: string } | null {
  const m = INVITE.exec(text);
  if (!m || !isMatchId(m[1])) return null;
  return { match: m[1], text: text.replace(/\s*·\s*match\s+[0-9a-f]{16}\s*$/, '').trim() };
}
