import type { OnlineStatus } from '../../../online/api';
import type { AskItem, Francs, InviteItem, Item, MeetItem, MoneyLimits, Tag } from '../../../online/protocol';
import { fcfaText } from '../../../economy/format';
import { cityTimeAt } from '../../../core/clock';

/**
 * The Messages app's words and rules, pure (no DOM): how an amount, a time, a day, a last-seen and a preview read; which actions a card offers to whom
 * in which state; which « + » actions are open now and, when not, the one sentence that says why; the city times a meeting can be set at. The screen
 * (src/ui/phone/apps/messages.ts) and Argent's Teranga Money block (money.ts) only draw what these say. Tested in tests/messagesText.test.ts.
 */
export const F = fcfaText;
/** Quick amounts of the money sheets (a typed amount is always possible). */
export const QUICK_AMOUNTS: Francs[] = [1_000, 2_000, 5_000, 10_000, 25_000, 50_000];
/** A note on money, an invitation or a meeting: a few words, shown, never parsed. */
export const NOTE_MAX = 60;

const pad = (n: number) => String(n).padStart(2, '0');
export const clockOf = (at: number) => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayStart = (at: number) => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Calendar days from `at` to `now` (0 = the same day), on the device's calendar. */
export const daysAgo = (at: number, now: number) => Math.round((dayStart(now) - dayStart(at)) / 86_400_000);
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const ddmm = (at: number) => { const d = new Date(at); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };

/** The time beside a conversation in the list: « 14:05 », « hier », « lun. », « 12/10 ». */
export function listTime(at: number, now: number): string {
  const n = daysAgo(at, now);
  if (n <= 0) return clockOf(at);
  if (n === 1) return 'hier';
  if (n < 7) return WEEKDAYS[new Date(at).getDay()].slice(0, 3) + '.';
  return ddmm(at);
}
/** A day separator in a conversation: « Aujourd’hui », « Hier », « lundi 12 octobre » (the year when it is not this one). */
export function dayLabel(at: number, now: number): string {
  const n = daysAgo(at, now);
  if (n <= 0) return 'Aujourd’hui';
  if (n === 1) return 'Hier';
  const d = new Date(at), y = d.getFullYear() !== new Date(now).getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MONTHS[d.getMonth()]}${y}`;
}
/** How long ago, in words: « à l’instant », « il y a 5 min », « il y a 2 h », « hier », « le 12/10 ». */
export function ago(at: number, now: number): string {
  const s = Math.max(0, now - at) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400 && daysAgo(at, now) === 0) return `il y a ${Math.floor(s / 3600)} h`;
  return daysAgo(at, now) === 1 ? 'hier' : `le ${ddmm(at)}`;
}
/** The other player's account, in words (the conversation's header, the list). */
export function seenText(seen: 'online' | number | 'never' | null, now: number): string {
  if (seen === 'online') return 'en ligne';
  if (seen === 'never') return 'pas encore sur Messages';
  if (seen === null) return '';
  const a = ago(seen, now);
  return a === 'à l’instant' ? 'vu à l’instant' : `vu ${a}`;
}
/** When the Teranga Money balance was known: connected, it is the server's now (« à l’instant »); else when it was last said (« il y a 3 min · hors ligne »). */
export function knownText(at: number, fresh: boolean, now: number): string {
  return fresh ? 'à l’instant' : `${ago(at, now)} · hors ligne`;
}
/** The account's state, said in words (never a coloured dot alone). */
export function statusText(s: OnlineStatus | null): { text: string; tone: 'on' | 'wait' | 'off' } {
  switch (s) {
    case 'online': return { text: 'En ligne', tone: 'on' };
    case 'connecting': return { text: 'Connexion…', tone: 'wait' };
    case 'reconnecting': return { text: 'Reconnexion… tes messages partiront dès le retour du réseau', tone: 'wait' };
    case 'offline': return { text: 'Hors ligne : tes messages partiront à la reconnexion', tone: 'off' };
    default: return { text: 'Mode solo : Messages a besoin de la connexion en ligne', tone: 'off' };
  }
}

// ------------------------------------------------------------------ the conversation

export type LogRow<T extends { id: string; at: number }> = { k: 'day'; key: string; label: string } | { k: 'item'; key: string; item: T };
/** Items oldest first, with a day separator before the first item of each day. */
export function groupByDay<T extends { id: string; at: number }>(items: readonly T[], now: number): LogRow<T>[] {
  const out: LogRow<T>[] = []; let day = NaN;
  for (const it of items) {
    const d = dayStart(it.at);
    if (d !== day) { day = d; out.push({ k: 'day', key: `day:${d}`, label: dayLabel(it.at, now) }); }
    out.push({ k: 'item', key: it.id, item: it });
  }
  return out;
}

/** The list's one line for a conversation's last item: what a player reads first (« 5 000 F envoyés », « Toi : à tout’ »). */
export function previewOf(item: Item | null, me: Tag | null): string {
  if (!item) return 'Pas encore de message';
  const mine = !!me && item.from === me;
  switch (item.k) {
    case 'text': return (mine ? 'Toi : ' : '') + item.text;
    case 'loc': return mine ? 'Tu as partagé ta position' : `📍 Position : ${item.name}`;
    case 'pay': return `${F(item.amount)} ${mine ? 'envoyés' : 'reçus'}`;
    case 'ask': return (mine ? `Tu demandes ${F(item.amount)}` : `Te demande ${F(item.amount)}`) + ({ open: '', paid: ' · payée ✓', declined: ' · refusée', cancelled: ' · annulée' } as const)[item.state];
    case 'invite': return mine ? 'Invitation chez toi' : `Invitation : ${item.home.name}`;
    case 'meet': return `Rendez-vous · ${item.place.name}${item.when ? ` à ${cityClock(item.when)}` : ' maintenant'}`;
  }
}

/** Why one of the player's items was refused or is late, in words (the item's `reason`). */
export function reasonText(reason: string | undefined): string {
  switch (reason) {
    case 'rate-limited': return 'trop rapide, attends un peu';
    case 'offline': case 'closed': case 'network': case 'timeout': return 'pas de réseau';
    case 'too-long': return 'trop long (500 caractères au plus)';
    case 'too-large': return 'trop long';
    case 'blocked': case 'unavailable': return 'ce joueur ne reçoit pas tes messages';
    case 'unknown-recipient': case 'not-found': return 'pas encore sur Messages';
    case 'empty': return 'message vide';
    default: return 'pas envoyé';
  }
}
/** A failed item the player can send again (a refusal for good is not offered again). */
export const retryable = (reason: string | undefined) => !['blocked', 'unavailable', 'unknown-recipient', 'not-found', 'too-long', 'too-large', 'empty', 'invalid'].includes(reason ?? '');

export type CardAct = 'pay' | 'decline' | 'cancel' | 'accept' | 'revoke' | 'counter' | 'go';
export interface CardAction { act: CardAct; label: string; kind: 'primary' | 'secondary' | 'quiet' }
export interface CardView { title: string; state: string; tone: '' | 'gain' | 'warn' | 'sun' | 'mute'; actions: CardAction[] }
/** What the world can do now (onlineHooks): « Y aller » only shows where it leads somewhere. */
export interface CardHooks { goToPlace?: boolean; goToLocation?: boolean; goToInvite?: boolean }

const btn = (act: CardAct, label: string, kind: CardAction['kind'] = 'secondary'): CardAction => ({ act, label, kind });
/**
 * The card of a money, invitation, meeting or location item, as `me` sees it: its title, its state in words and the actions open to this side in this
 * state. A request: the payer « Payer » / « Refuser », the payee « Annuler », then « Payée ✓ / Refusée / Annulée ». An invitation: the host « Retirer
 * l’invitation », the guest « Accepter » / « Refuser » then « Y aller ». A meeting: the other « Accepter » / « Refuser » / « Proposer une autre heure », the
 * proposer « Annuler », both « Y aller » once accepted, « Vous y êtes tous les deux ✓ » once met. `name` is the other player's.
 */
export function cardOf(item: Item, me: Tag | null, name: string, now: number, hooks: CardHooks = {}): CardView {
  const mine = !!me && item.from === me;
  switch (item.k) {
    case 'pay':
      return { title: `${F(item.amount)} ${mine ? 'envoyés' : 'reçus'}`, state: item.req ? (mine ? 'Demande payée' : 'Pour ta demande') : '', tone: 'gain', actions: [] };
    case 'ask': return askCard(item, mine, name);
    case 'invite': return inviteCard(item, mine, name, now, hooks);
    case 'meet': return meetCard(item, mine, name, now, hooks, me);
    case 'loc':
      return { title: item.name, state: mine ? 'Ta position partagée' : `Position de ${name}`, tone: '', actions: !mine && hooks.goToLocation ? [btn('go', 'Y aller', 'primary')] : [] };
    case 'text': return { title: item.text, state: '', tone: '', actions: [] };
  }
}
function askCard(a: AskItem, mine: boolean, name: string): CardView {
  const title = mine ? `Tu demandes ${F(a.amount)}` : `${name} te demande ${F(a.amount)}`;
  if (a.state === 'paid') return { title, state: 'Payée ✓', tone: 'gain', actions: [] };
  if (a.state === 'declined') return { title, state: 'Refusée', tone: 'mute', actions: [] };
  if (a.state === 'cancelled') return { title, state: 'Annulée', tone: 'mute', actions: [] };
  return mine ? { title, state: 'En attente', tone: 'sun', actions: [btn('cancel', 'Annuler', 'quiet')] }
    : { title, state: 'À payer', tone: 'sun', actions: [btn('pay', 'Payer', 'primary'), btn('decline', 'Refuser')] };
}
function inviteCard(i: InviteItem, mine: boolean, name: string, now: number, hooks: CardHooks): CardView {
  const title = mine ? `Invitation pour ${name}` : `Invitation de ${name}`;
  const expired = i.state === 'expired' || (i.state === 'open' && i.until > 0 && i.until < now);
  if (expired) return { title, state: 'Expirée', tone: 'mute', actions: [] };
  if (i.state === 'declined') return { title, state: 'Refusée', tone: 'mute', actions: [] };
  if (i.state === 'revoked') return { title, state: 'Retirée', tone: 'mute', actions: [] };
  if (i.state === 'accepted') return { title, state: 'Acceptée ✓', tone: 'gain', actions: mine ? [btn('revoke', 'Retirer l’invitation', 'quiet')] : hooks.goToInvite ? [btn('go', 'Y aller', 'primary')] : [] };
  return mine ? { title, state: 'En attente de réponse', tone: 'sun', actions: [btn('revoke', 'Retirer l’invitation', 'quiet')] }
    : { title, state: 'Nouvelle invitation', tone: 'sun', actions: [btn('accept', 'Accepter', 'primary'), btn('decline', 'Refuser')] };
}
function meetCard(m: MeetItem, mine: boolean, name: string, now: number, hooks: CardHooks, meTag: Tag | null): CardView {
  const title = `${m.place.name} · ${m.when ? cityWhen(m.when, now) : 'maintenant'}`;
  const go = hooks.goToPlace ? [btn('go', 'Y aller', 'primary')] : [];
  switch (m.state) {
    case 'met': return { title, state: 'Vous y êtes tous les deux ✓', tone: 'gain', actions: [] };
    case 'missed': return { title, state: 'Manqué', tone: 'mute', actions: [] };
    case 'declined': return { title, state: 'Refusé', tone: 'mute', actions: [] };
    case 'cancelled': return { title, state: 'Annulé', tone: 'mute', actions: [] };
    case 'countered': return { title, state: 'Autre heure proposée', tone: 'mute', actions: [] };
    case 'accepted': {
      const there = !!meTag && m.here.includes(meTag);
      return { title, state: there ? `Accepté ✓ · tu y es, on attend ${name}` : 'Accepté ✓', tone: 'gain', actions: [...go, ...(mine ? [btn('cancel', 'Annuler', 'quiet')] : [])] };
    }
    default:
      return mine ? { title, state: `En attente de ${name}`, tone: 'sun', actions: [btn('cancel', 'Annuler', 'quiet')] }
        : { title, state: 'Proposé', tone: 'sun', actions: [btn('accept', 'Accepter', 'primary'), btn('decline', 'Refuser'), btn('counter', 'Proposer une autre heure')] };
  }
}

// ------------------------------------------------------------------ « + »

export type PlusId = 'pay' | 'ask' | 'invite' | 'meet' | 'loc';
export const PLUS: [PlusId, string, string][] = [
  ['pay', 'Envoyer de l’argent', '💸'], ['ask', 'Demander de l’argent', '🧾'], ['invite', 'Inviter chez moi', '🏠'], ['meet', 'Proposer un rendez-vous', '🤝'], ['loc', 'Partager ma position', '📍'],
];
export interface PlusCtx {
  status: OnlineStatus | null; seen: 'online' | number | 'never' | null; blocked: boolean; name: string;
  /** The world's hooks present in this build (onlineHooks): an action without its hook is not shown at all. */
  hooks: { invite: boolean; meet: boolean; loc: boolean };
  /** A home to invite into now, and a position to share now. */
  home: boolean; here: boolean;
}
/** Why every « + » action is closed now (offline, blocked, not on Messages), or '': said once, above them. */
export function plusClosed(c: Pick<PlusCtx, 'status' | 'blocked' | 'seen' | 'name'>): string {
  return c.status !== 'online' ? 'Hors ligne : possible dès que tu es reconnecté.'
    : c.blocked ? `Tu as bloqué ${c.name}.`
      : c.seen === 'never' ? `${c.name} n’a pas encore ouvert Messages.` : '';
}
/** The « + » menu: exactly these five, each open, or closed with the sentence that says why; an action whose world hook is missing is hidden. */
export function plusActions(c: PlusCtx): { id: PlusId; label: string; icon: string; ok: boolean; why: string }[] {
  const common = plusClosed(c);
  return PLUS.filter(([id]) => (id === 'invite' ? c.hooks.invite : id === 'meet' ? c.hooks.meet : id === 'loc' ? c.hooks.loc : true)).map(([id, label, icon]) => {
    const why = common || (id === 'invite' && !c.home ? 'Tu n’as pas encore de logement où recevoir.' : id === 'loc' && !c.here ? 'Ta position n’est pas disponible ici.' : '');
    return { id, label, icon, ok: !why, why };
  });
}

// ------------------------------------------------------------------ meetings: the city's clock (1 city hour = 1 real minute, src/core/clock.ts)

/** One city minute in real ms. */
const CITY_MIN_MS = 1000;
export const cityClock = (ms: number) => { const t = cityTimeAt(ms); return `${pad(t.hour)}:${pad(t.minute)}`; };
/** How far away a real moment is, in real time: « dans 3 min », « dans 40 s », « maintenant », « il y a 2 min ». */
export function realIn(when: number, now: number): string {
  const s = Math.round((when - now) / 1000);
  if (Math.abs(s) < 10) return 'maintenant';
  const a = Math.abs(s), t = a < 60 ? `${a} s` : `${Math.round(a / 60)} min`;
  return s > 0 ? `dans ${t}` : `il y a ${t}`;
}
/** A meeting's city time: « à 18:00 », « demain à 08:00 ». */
export function cityWhen(when: number, now: number): string {
  const d = cityTimeAt(when).day - cityTimeAt(now).day;
  return `${d === 1 ? 'demain ' : d > 1 ? `jour ${cityTimeAt(when).day} ` : ''}à ${cityClock(when)}`;
}
export interface WhenChoice { id: string; label: string; when: number; clock: string; sub: string }
/**
 * The times a meeting can be set at, from the shared clock: « Maintenant » (sent as 0), « Dans 1 h » (city, to the quarter), and the next two even city
 * hours at least two city hours away (« À 18 h »). Each says its city time (« 18:00 ») and, under it, how long that is in real time.
 */
export function meetChoices(now: number): WhenChoice[] {
  const m = cityTimeAt(now).hourFloat * 60;                                             // city minute of the day, with its fraction
  const at = (target: number) => Math.round(now + (target - m) * CITY_MIN_MS);
  const soon = Math.ceil((m + 60) / 15) * 15, h1 = Math.ceil((m + 120) / 120) * 120, h2 = h1 + 120;
  const hourLabel = (t: number) => `À ${Math.floor(t / 60) % 24} h`;
  const out: WhenChoice[] = [{ id: 'now', label: 'Maintenant', when: 0, clock: cityClock(now), sub: 'tout de suite' }];
  for (const [id, label, t] of [['soon', 'Dans 1 h', soon], ['h1', hourLabel(h1), h1], ['h2', hourLabel(h2), h2]] as const) {
    const when = at(t); out.push({ id, label, when, clock: cityClock(when), sub: realIn(when, now) });
  }
  return out;
}

// ------------------------------------------------------------------ friend codes and amounts

/** What the player types, as a friend code: hex only, upper case, in groups of four (« 7F3A-91C2-0B4E-55D1 »). */
export function formatCode(input: string): string {
  const hex = input.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 16);
  return hex.replace(/(.{4})(?=.)/g, '$1-');
}
export const isCode = (code: string) => /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(code);
/** A tag shown as its friend code. */
export const codeOf = (tag: Tag) => formatCode(tag);

/** Today's limits in one line each, for the money sheets and Argent (« Envoyé aujourd’hui : 5 000 F sur 500 000 F »). */
export function limitLines(l: MoneyLimits | null, today: { funded: Francs; sent: Francs; received: Francs } | null): string[] {
  if (!l) return [];
  const t = today ?? { funded: 0, sent: 0, received: 0 };
  return [
    `Envoyé aujourd’hui : ${F(t.sent)} sur ${F(l.sendDayMax)}`,
    `Rechargé aujourd’hui : ${F(t.funded)} sur ${F(l.fundDayMax)}`,
    `Reçu aujourd’hui : ${F(t.received)} sur ${F(l.receiveDayMax)}`,
    `${F(l.opMax)} au plus par opération · solde ${F(l.balanceMax)} au plus`,
  ];
}

/** Initials for an avatar without a picture (« Awa » → « A », « Mame Diarra » → « MD »). */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}
/** The shirt colours of presence's looks (src/multiplayer/avatars.ts SHIRT_COLORS), for the avatar's disc. */
export const LOOK_COLORS = ['#1a9d54', '#2f6fb3', '#d9482b', '#e0a800', '#6b3fa0', '#8a8a8a'];
export const lookColor = (look: number) => LOOK_COLORS[Math.abs(Math.round(look)) % LOOK_COLORS.length] ?? LOOK_COLORS[0];

/** Why a top-up (wallet → Teranga Money) cannot go now, said before the confirmation ('' when it can; the server decides in the end). */
export function fundCheck(amount: Francs, wallet: Francs, balance: Francs, l: MoneyLimits | null, today: { funded: Francs } | null, status: OnlineStatus | null): string {
  if (status !== 'online') return 'Hors ligne : la recharge pourra se faire une fois reconnecté.';
  if (!(amount >= 1)) return 'Choisis un montant.';
  if (l && amount > l.opMax) return `${F(l.opMax)} au plus par recharge.`;
  if (amount > wallet) return `Ton portefeuille n’a que ${F(wallet)}.`;
  const funded = today?.funded ?? 0;
  if (l && funded + amount > l.fundDayMax) return `Encore ${F(Math.max(0, l.fundDayMax - funded))} de recharge permise aujourd’hui.`;
  if (l && balance + amount > l.balanceMax) return `Teranga Money ne peut pas dépasser ${F(l.balanceMax)}.`;
  return '';
}
/** Why a withdrawal (Teranga Money → wallet) cannot go now ('' when it can). */
export function cashoutCheck(amount: Francs, balance: Francs, l: MoneyLimits | null, status: OnlineStatus | null): string {
  if (status !== 'online') return 'Hors ligne : le retrait pourra se faire une fois reconnecté.';
  if (!(amount >= 1)) return 'Choisis un montant.';
  if (l && amount > l.opMax) return `${F(l.opMax)} au plus par retrait.`;
  if (amount > balance) return `Teranga Money n’a que ${F(balance)}.`;
  return '';
}
