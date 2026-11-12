import type { InviteItem, Item, MeetItem, MoneyLimits, Tag } from './protocol';

/**
 * The rules of a player's account (docs/ld2/LD2_B_CONTRACT.md « The account »), pure so vitest checks them without the Workers runtime: what a
 * blocked player's items become, the life of an invitation and of a meeting under their authority (the host's account, the proposer's account), who
 * may visit, who may be found, and the sentence each refusal is shown with. server/social.ts applies them; the client (src/online/client.ts) uses the
 * windows and the texts.
 */
export interface MeetTimes { early: number; late: number; nowOpen: number }

/** Every state change of a stateful item raises its revision: an account keeps a copy only if it is newer than the one it has (deliveries may cross). */
export const STATEFUL: ReadonlySet<Item['k']> = new Set(['ask', 'invite', 'meet']);

/**
 * What the recipient's account does with an item another account forwards. From a player it blocked: new text and locations are accepted and dropped
 * (the sender is not told), new invitations and meetings too (the sender's own account refused them already, unless the block came in between); money
 * items are always kept (the ledger has moved or recorded the money), and so are new states of items already known (a cancellation, a revocation).
 */
export function deliveryOf(item: Item, o: { blocked: boolean; known: boolean }): 'store' | 'drop' {
  if (!o.blocked || o.known || item.k === 'pay' || item.k === 'ask') return 'store';
  return 'drop';
}
/** When the recipient blocked the sender: text and locations go through without being delivered; everything else is refused, 'unavailable'. */
export const silentWhenBlocked = (kind: 'say' | 'loc' | 'pay' | 'ask' | 'invite' | 'meet') => kind === 'say' || kind === 'loc';

// ------------------------------------------------------------------ invitations (authority: the host's account)
export type InviteAct = 'accept' | 'decline' | 'revoke' | 'expire';
export type Next<T> = { ok: true; item: T; changed: boolean } | { ok: false; reason: 'closed' | 'invalid' };
const live = (i: InviteItem) => i.state === 'open' || i.state === 'accepted';
/**
 * The next state of an invitation. The guest accepts or declines an open one; the host revokes an open or accepted one; past `until` an open or accepted
 * one is expired (and nothing else applies to it). Asking for the state it already has is a duplicate (unchanged, ok).
 */
export function inviteNext(item: InviteItem, guest: Tag, act: InviteAct, by: Tag | null, now: number): Next<InviteItem> {
  const host = item.from;
  if (act !== 'expire' && by !== guest && by !== host) return { ok: false, reason: 'invalid' };
  if (live(item) && now >= item.until) return act === 'expire' ? { ok: true, item: { ...item, state: 'expired' }, changed: true } : { ok: false, reason: 'closed' };
  if (act === 'expire') return { ok: true, item, changed: false };
  if (act === 'revoke') {
    if (by !== host) return { ok: false, reason: 'invalid' };
    if (item.state === 'revoked') return { ok: true, item, changed: false };
    return live(item) ? { ok: true, item: { ...item, state: 'revoked' }, changed: true } : { ok: false, reason: 'closed' };
  }
  if (by !== guest) return { ok: false, reason: 'invalid' };
  const to = act === 'accept' ? 'accepted' : 'declined';
  if (item.state === to) return { ok: true, item, changed: false };
  return item.state === 'open' ? { ok: true, item: { ...item, state: to }, changed: true } : { ok: false, reason: 'closed' };
}
/**
 * May `guest` come into the host's home now? The newest accepted, unrevoked, unexpired invitation from the host to the guest opens it; otherwise the
 * newest one says why not (a revoked one: 'revoked').
 */
export function visitCheck(invites: InviteItem[], guest: Tag, now: number): { ok: true; invite: InviteItem } | { ok: false; reason: 'no-invite' | 'revoked' } {
  const mine = invites.filter(i => i.from !== guest).sort((a, b) => b.at - a.at);
  const good = mine.find(i => i.state === 'accepted' && now < i.until);
  if (good) return { ok: true, invite: good };
  return { ok: false, reason: mine[0]?.state === 'revoked' ? 'revoked' : 'no-invite' };
}

// ------------------------------------------------------------------ meetings (authority: the proposer's account)
export type MeetAct = 'accept' | 'decline' | 'counter' | 'cancel' | 'here' | 'tick';
/** A meeting's window (server ms), once it has a time: from `early` before to `late` after. Null for an open « maintenant » proposal (no time yet). */
export function meetWindow(m: Pick<MeetItem, 'when'>, t: MeetTimes): { from: number; to: number } | null {
  return m.when > 0 ? { from: m.when - t.early, to: m.when + t.late } : null;
}
/**
 * The next state of a meeting. The other player accepts, declines or counters an open proposal (a « maintenant » one gets its time when accepted);
 * either player cancels an open or accepted one; a player at the place in the window is `here` (both: `met`). `tick` (the authority's alarm, or any
 * read) turns a meeting past its window without both into `missed`, and an unanswered proposal past its time too.
 */
export function meetNext(item: MeetItem, other: Tag, act: MeetAct, by: Tag | null, now: number, t: MeetTimes): Next<MeetItem> {
  const proposer = item.from;
  if (act !== 'tick' && by !== proposer && by !== other) return { ok: false, reason: 'invalid' };
  const w = meetWindow(item, t);
  const overdue = (item.state === 'open' && (w ? now > w.to : now > item.at + t.nowOpen)) || (item.state === 'accepted' && !!w && now > w.to);
  if (overdue) return act === 'tick' ? { ok: true, item: { ...item, state: 'missed' }, changed: true } : { ok: false, reason: 'closed' };
  if (act === 'tick') return { ok: true, item, changed: false };
  if (act === 'cancel') {
    if (item.state === 'cancelled') return { ok: true, item, changed: false };
    return item.state === 'open' || item.state === 'accepted' ? { ok: true, item: { ...item, state: 'cancelled' }, changed: true } : { ok: false, reason: 'closed' };
  }
  if (act === 'here') {
    if (item.state === 'met' && item.here.includes(by!)) return { ok: true, item, changed: false };
    if (item.state !== 'accepted' || !w || now < w.from) return { ok: false, reason: 'closed' };
    if (item.here.includes(by!)) return { ok: true, item, changed: false };
    const here = [...item.here, by!];
    return { ok: true, item: { ...item, here, state: here.includes(proposer) && here.includes(other) ? 'met' : 'accepted' }, changed: true };
  }
  if (by !== other) return { ok: false, reason: 'invalid' };
  const to = act === 'accept' ? 'accepted' : act === 'decline' ? 'declined' : 'countered';
  if (item.state === to) return { ok: true, item, changed: false };
  if (item.state !== 'open') return { ok: false, reason: 'closed' };
  return { ok: true, item: { ...item, state: to, ...(to === 'accepted' && item.when === 0 ? { when: now } : {}) }, changed: true };
}
/** When the next tick could change this item (an alarm time), or null. */
export function nextDeadline(item: Item, t: MeetTimes): number | null {
  if (item.k === 'invite') return item.state === 'open' || item.state === 'accepted' ? item.until : null;
  if (item.k !== 'meet') return null;
  const w = meetWindow(item, t);
  if (item.state === 'open') return w ? w.to + 1 : item.at + t.nowOpen + 1;
  return item.state === 'accepted' && w ? w.to + 1 : null;
}

// ------------------------------------------------------------------ blocking, finding
/**
 * What a block changes among the items an account is the authority of (`mine`: those it authored): its invitations to the other player are revoked and
 * its meetings with them cancelled. The other player's account does the same with its own (told by the blocker's account).
 */
export function blockEffects(mine: Item[], me: Tag): Item[] {
  const out: Item[] = [];
  for (const i of mine) {
    if (i.from !== me) continue;
    if (i.k === 'invite' && (i.state === 'open' || i.state === 'accepted')) out.push({ ...i, state: 'revoked' });
    else if (i.k === 'meet' && (i.state === 'open' || i.state === 'accepted')) out.push({ ...i, state: 'cancelled' });
  }
  return out;
}
/** May one player be told where the other is? Only with an accepted invitation (not expired) or an accepted meeting still to come or under way. */
export function findAllowed(items: Item[], now: number, t: MeetTimes): boolean {
  return items.some(i => (i.k === 'invite' && i.state === 'accepted' && now < i.until)
    || (i.k === 'meet' && (i.state === 'accepted' || i.state === 'met') && (meetWindow(i, t)?.to ?? 0) >= now));
}
/** The other player's account as a conversation shows it: a client connected now, the last time one was, or never (not on Messages yet). */
export function seenOf(o: { sockets: number; lastSeen: number | null; exists: boolean }): 'online' | number | 'never' {
  return !o.exists ? 'never' : o.sockets > 0 ? 'online' : o.lastSeen ?? 'never';
}

// ------------------------------------------------------------------ what the player is told
const francs = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
/** Every reason a request can fail for, client-side ones included (`pending`, `save`, `solo`…). */
export type Reason =
  | 'amount' | 'insufficient' | 'limit-op' | 'limit-fund' | 'limit-send' | 'limit-receive' | 'limit-balance' | 'self' | 'unknown-recipient'
  | 'unavailable' | 'request-closed' | 'request-mismatch' | 'offline' | 'invalid' | 'rate-limited' | 'blocked' | 'not-found' | 'closed' | 'too-large'
  | 'pending' | 'timeout' | 'save' | 'solo' | 'empty' | 'code' | 'no-home' | 'no-invite' | 'revoked' | 'no-place';
export const REASONS: readonly Reason[] = ['amount', 'insufficient', 'limit-op', 'limit-fund', 'limit-send', 'limit-receive', 'limit-balance', 'self',
  'unknown-recipient', 'unavailable', 'request-closed', 'request-mismatch', 'offline', 'invalid', 'rate-limited', 'blocked', 'not-found', 'closed',
  'too-large', 'pending', 'timeout', 'save', 'solo', 'empty', 'code', 'no-home', 'no-invite', 'revoked', 'no-place'];
/** The sentence shown for a refusal (French, as it is): the limits are said with their numbers. */
export function refusalText(reason: string, limits: MoneyLimits): string {
  const t: Record<Reason, string> = {
    amount: 'Montant invalide : un nombre entier de francs, au moins 1 F.',
    insufficient: 'Solde insuffisant : Teranga Money et le portefeuille ne suffisent pas.',
    'limit-op': `Au plus ${francs(limits.opMax)} par opération.`,
    'limit-fund': `Limite de recharge du jour atteinte (${francs(limits.fundDayMax)} par jour).`,
    'limit-send': `Limite d’envoi du jour atteinte (${francs(limits.sendDayMax)} par jour).`,
    'limit-receive': `Cette personne a déjà reçu le maximum du jour (${francs(limits.receiveDayMax)}).`,
    'limit-balance': `Un compte Teranga Money ne dépasse pas ${francs(limits.balanceMax)}.`,
    self: 'Tu ne peux pas t’envoyer de l’argent à toi-même.',
    'unknown-recipient': 'Cette personne n’est pas encore sur Messages.',
    unavailable: 'Cette personne n’est pas joignable.',
    'request-closed': 'Cette demande est déjà réglée ou fermée.',
    'request-mismatch': 'Ce paiement ne correspond pas à la demande.',
    offline: 'Hors ligne : réessaie une fois la connexion revenue.',
    invalid: 'Le serveur a refusé cette demande.',
    'rate-limited': 'Trop rapide : attends quelques secondes.',
    blocked: 'Tu as bloqué cette personne : débloque-la d’abord.',
    'not-found': 'Introuvable : c’est peut-être déjà effacé.',
    closed: 'Ce n’est plus possible : c’est déjà réglé, fermé ou passé.',
    'too-large': 'Trop long.',
    pending: 'Pas encore de réponse du serveur : ce sera confirmé à la reconnexion, jamais compté deux fois.',
    timeout: 'Pas de réponse du serveur : réessaie.',
    save: 'Impossible d’enregistrer la partie sur cet appareil : rien n’a été envoyé ni débité.',
    solo: 'Messages n’est pas disponible dans cette version du jeu.',
    empty: 'Message vide.',
    code: 'Code invalide : 16 caractères, comme 7F3A-91C2-0B4E-55D1.',
    'no-home': 'Tu n’as pas de logement où inviter.',
    'no-invite': 'Pas d’invitation acceptée pour entrer ici.',
    revoked: 'L’invitation a été retirée.',
    'no-place': 'Position inconnue pour l’instant.',
  };
  return t[reason as Reason] ?? t.invalid;
}
