import type { HubId } from '../core/types';
import { cleanChatText, chatLength } from '../multiplayer/chatRules';

/**
 * LD2.0-B « Belong Online »: the wire contract between a client and its own account on the server (docs/ld2/LD2_B_CONTRACT.md).
 *
 * One WebSocket per client to `/api/me` (beside the hub's presence socket, src/multiplayer/client.ts). The Worker turns the device key into the
 * player's public tag (the same tag presence shows to others) and hands the socket to that player's account (a Durable Object). Everything here is
 * game money and game life: no real payment, no media, no external calendar.
 *
 * Rules every message keeps:
 * - A client asks; only the server decides. No balance, request, invitation or meetup state is ever set by a client.
 * - Every request that changes something carries an `id` (a uuid made when the player confirmed) and is answered once by an `ack` with that id. The
 *   same id sent again (a double tap, a resend after a reconnect) is never applied twice: the server answers with the first result (`duplicate`).
 * - Chat text is never read for meaning: a message cannot pay, lend, invite or schedule anything. Only the « + » sheets' confirmations do.
 * - Shapes are strict: a server refuses an unknown type or field (the connection stays open, the request gets `ack.ok = false`, reason 'invalid').
 */
export const ONLINE_PROTOCOL = 1;
/** Largest frame either side sends: a home snapshot is the largest message. */
export const ONLINE_MAX_FRAME = 16_384;

/** A player's public id: 16 hex characters (SHA-256 of the private device key, as presence's `tag`). Never the key itself. */
export type Tag = string;
/** The tag as a code a player can read out or type: `7F3A-91C2-0B4E-55D1` (upper case, groups of four). */
export type FriendCode = string;

// ------------------------------------------------------------------ money (Teranga Money, the server-held account)

/** Game francs. Whole numbers, never below 0. */
export type Francs = number;
/** Limits the server enforces (and sends in `welcome`, so the UI can say them before the player tries). */
export interface MoneyLimits {
  /** One operation (send, request, top-up, withdrawal): 1 … opMax F. */
  opMax: Francs;
  /** Money a device may bring into Teranga Money per server day (top-ups, including a send's top-up part). */
  fundDayMax: Francs;
  /** Money an account may send to other players per server day. */
  sendDayMax: Francs;
  /** Money an account may receive from other players per server day. */
  receiveDayMax: Francs;
  /** Largest Teranga Money balance. */
  balanceMax: Francs;
}
/**
 * One operation of the server's ledger, as a player's history shows it. `kind`:
 * - `fund`: the player's wallet → their Teranga Money (the device paid it; the server credited it);
 * - `cashout`: their Teranga Money → their wallet (the server debited it; the device credits the wallet once, by `id`);
 * - `pay`: Teranga Money of `from` → Teranga Money of `to`. A send may carry a top-up (`fund` > 0, from the sender's wallet) in the same operation.
 */
export interface LedgerOp {
  id: string; kind: 'fund' | 'cashout' | 'pay'; at: number; amount: Francs;
  from?: Tag; to?: Tag;
  /** For a send: the part brought from the sender's wallet in the same operation. */
  fund?: Francs;
  /** The money request this send paid. */
  req?: string;
  /** A short note (« Pour le taxi », « Cadeau »): shown, never parsed. */
  note?: string;
}
/** Why the server refused a money operation (and the client's reasons before it is even sent). */
export type MoneyRefusal =
  | 'amount' | 'insufficient' | 'limit-op' | 'limit-fund' | 'limit-send' | 'limit-receive' | 'limit-balance'
  | 'self' | 'unknown-recipient' | 'unavailable' | 'request-closed' | 'request-mismatch' | 'offline' | 'invalid';

// ------------------------------------------------------------------ places and homes

/** An existing destination of the game: a directory place or an interactable of a district (`cityPlaces`, a home's street door…). */
export interface PlaceRef { id: string; hub: HubId; name: string; icon?: string }
/** A home a player lives in or owns, as another player is invited into it. */
export interface HomeRef {
  /** The catalogue id of the home (src/economy/catalog.ts HOMES). */
  spec: string; hub: HubId;
  /** The home's street door (an interactable id of that district: where the guest is guided to). */
  door: string;
  /** « Résidence Jàmm · appartement » */
  name: string;
}
/**
 * What a guest's client needs to draw the host's home exactly as the host has it (read-only on the guest's side). Built by the host's client from its
 * save; stored by the host's account; given only to a guest with an accepted, unrevoked invitation. Its exact fields are the home lane's
 * (src/online/visit.ts), validated by size and shape on the server (`snapshot` ≤ 12 000 characters as JSON).
 */
export interface HomeSnapshot {
  home: HomeRef;
  /** The home's upgrades that show in its shell (« peinture »…). */
  upgrades: string[];
  /** Furniture placed in it: catalogue id and where it stands (the home's own placement frame, src/economy/placement.ts). */
  furniture: { spec: string; at: unknown }[];
  /** When the host's client made it (ms). */
  at: number;
}
/** What a guest may do in the host's home. Guests can never move, buy, sell or take anything: there is no permission for that. */
export interface GuestPerms {
  /** Sit on the sofas, chairs and beds, use the TV and the radio. Off: look around only. */
  use: boolean;
}

// ------------------------------------------------------------------ conversation items

/** Everything a private conversation holds. Both players' accounts keep a copy; the `id` is the same on both sides. */
export type Item = TextItem | LocationItem | PayItem | AskItem | InviteItem | MeetItem;
interface ItemBase { id: string; from: Tag; at: number }
export interface TextItem extends ItemBase { k: 'text'; text: string }
/** « Partager ma position »: a point in a district, and the nearest named place. */
export interface LocationItem extends ItemBase { k: 'loc'; hub: HubId; x: number; z: number; name: string }
/** Money sent from `from` to the other player of the conversation (always completed: a refused send is never an item). */
export interface PayItem extends ItemBase { k: 'pay'; amount: Francs; op: string; note?: string; req?: string }
export type AskState = 'open' | 'paid' | 'declined' | 'cancelled';
/** A money request from `from` (the payee) to the other player. Paid at most once, by one `pay` whose `req` is this id. */
export interface AskItem extends ItemBase { k: 'ask'; amount: Francs; note?: string; state: AskState; paidBy?: string }
export type InviteState = 'open' | 'accepted' | 'declined' | 'revoked' | 'expired';
/** « Inviter chez moi »: `from` is the host. Authority: the host's account. */
export interface InviteItem extends ItemBase { k: 'invite'; home: HomeRef; perms: GuestPerms; state: InviteState; until: number }
export type MeetState = 'open' | 'accepted' | 'declined' | 'countered' | 'cancelled' | 'met' | 'missed';
/**
 * « Proposer un rendez-vous »: `from` proposes `place` at `when` (server ms; 0 = « maintenant »). Authority: the proposer's account. A counter-proposal is a
 * new MeetItem with `counter` = the id it answers (that one becomes 'countered'). `here`: the tags already at the place in the meeting's window.
 */
export interface MeetItem extends ItemBase { k: 'meet'; place: PlaceRef; when: number; state: MeetState; counter?: string; here: Tag[]; note?: string }

/** A conversation as the list shows it. */
export interface ConvSummary {
  with: Tag; name: string; look: number; app?: string;
  last: Item | null; unread: number;
  /** The other player's account: 'online' (a client connected now), the last time seen, or 'never' (never opened Messages: nothing can reach them yet). */
  seen: 'online' | number | 'never';
  blocked: boolean;
}

// ------------------------------------------------------------------ client → account

export type ClientMessage =
  /** History of one conversation, newest first, `before` an item time (paging). */
  | { type: 'conv'; with: Tag; before?: number }
  | { type: 'read'; with: Tag }
  | { type: 'say'; id: string; to: Tag; text: string }
  | { type: 'loc'; id: string; to: Tag; hub: HubId; x: number; z: number; name: string }
  /** Send money. `fund`: the part to take from the wallet first (the device has already reserved it, see LD2_B_CONTRACT.md « The device's side »). */
  | { type: 'pay'; id: string; to: Tag; amount: Francs; fund: Francs; note?: string; req?: string }
  | { type: 'ask'; id: string; to: Tag; amount: Francs; note?: string }
  /** The payer declines a request, or the requester cancels it (`ref` = the request's id). */
  | { type: 'ask-close'; id: string; ref: string; how: 'declined' | 'cancelled' }
  | { type: 'fund'; id: string; amount: Francs }
  | { type: 'cashout'; id: string; amount: Francs }
  /** Money history of this account (newest first). */
  | { type: 'history'; before?: number }
  | { type: 'invite'; id: string; to: Tag; snapshot: HomeSnapshot; perms: GuestPerms }
  | { type: 'invite-answer'; id: string; ref: string; accept: boolean }
  | { type: 'invite-revoke'; id: string; ref: string }
  /** The host's client refreshes the snapshot of its open invitations (furniture moved). */
  | { type: 'home'; id: string; snapshot: HomeSnapshot }
  /** A guest asks to come in: answered by `visit`. */
  | { type: 'visit'; id: string; host: Tag }
  | { type: 'meet'; id: string; to: Tag; place: PlaceRef; when: number; note?: string; counter?: string }
  | { type: 'meet-answer'; id: string; ref: string; accept: boolean }
  | { type: 'meet-cancel'; id: string; ref: string }
  /** This player is at the meeting's place, in its window. */
  | { type: 'meet-here'; id: string; ref: string }
  | { type: 'block'; id: string; tag: Tag; on: boolean }
  | { type: 'report'; id: string; tag: Tag; reason: 'insulte' | 'harcelement' | 'arnaque' | 'autre' }
  /** Forget a conversation on this account (the other player keeps theirs). */
  | { type: 'forget'; id: string; with: Tag }
  /** Is there a player with this friend code? Answered by `lookup`. */
  | { type: 'lookup'; id: string; code: FriendCode }
  /** Where this client is now (presence hub and room), told to its own account only. */
  | { type: 'where'; hub: HubId | null; room: number }
  /** Where a player is, for a meeting or a visit between them (answered only when one is accepted). */
  | { type: 'find'; id: string; tag: Tag };

// ------------------------------------------------------------------ account → client

export type Ack =
  | { type: 'ack'; id: string; ok: true; duplicate?: boolean; item?: Item; op?: LedgerOp; balance?: Francs }
  | { type: 'ack'; id: string; ok: false; reason: MoneyRefusal | 'rate-limited' | 'blocked' | 'not-found' | 'closed' | 'too-large' };

export type ServerMessage =
  | {
    type: 'welcome'; v: number; tag: Tag; code: FriendCode; time: number;
    balance: Francs; limits: MoneyLimits;
    /** How much of today's limits is used (server day). */
    today: { funded: Francs; sent: Francs; received: Francs };
    convs: ConvSummary[]; blocked: Tag[];
  }
  | { type: 'conv'; with: Tag; items: Item[]; more: boolean }
  /** A new item, or a new state of one already known (same id: replace it). */
  | { type: 'item'; with: Tag; item: Item; name?: string; look?: number; app?: string }
  | { type: 'balance'; balance: Francs; today: { funded: Francs; sent: Francs; received: Francs } }
  | { type: 'history'; ops: LedgerOp[]; more: boolean }
  | { type: 'seen'; tag: Tag; seen: 'online' | number | 'never' }
  | { type: 'visit'; id: string; ok: boolean; host: Tag; snapshot?: HomeSnapshot; perms?: GuestPerms; invite?: string; reason?: 'no-invite' | 'revoked' | 'blocked' }
  /** The host revoked a visit (or blocked the guest): a guest inside leaves. */
  | { type: 'visit-end'; host: Tag; invite: string }
  | { type: 'lookup'; id: string; tag: Tag | null; name?: string; look?: number; app?: string }
  | { type: 'find'; id: string; tag: Tag; hub: HubId | null; room: number }
  | Ack;

// ------------------------------------------------------------------ validators (pure: the account on the server, the client, vitest)
//
// Strict shapes: an unknown type or field, a wrong type, an over-long string or a list too long is 'invalid'. Amounts are only checked to be whole
// (safe integers): their range is the ledger's rule (src/online/ledgerRules.ts), so a refusal can say why ('amount', 'limit-op'…).

/** A home snapshot as JSON, at most (characters): ECONOMY.online.snapshotMax, repeated here so the wire has no game dependency (a test keeps them in step). */
export const SNAPSHOT_MAX = 12_000;
/** A note on money (« Pour le taxi »), a place's or a shared location's name: short words, cleaned like chat text. */
export const NOTE_MAX = 80, PLACE_NAME_MAX = 60;
const TAG_RE = /^[0-9a-f]{16}$/, OP_RE = /^[A-Za-z0-9-]{8,64}$/, SPEC_RE = /^[a-z0-9_]{1,40}$/, REF_RE = /^[A-Za-z0-9:_.-]{1,64}$/;
const HUBS: readonly string[] = ['plateau', 'corniche', 'almadies', 'pikine'];
const REPORTS: readonly string[] = ['insulte', 'harcelement', 'arnaque', 'autre'];
// text cleaning is the chat rules' (src/multiplayer/chatRules.ts cleanChatText): the same characters are refused or removed everywhere

/** A public tag: 16 lower-case hex characters. */
export const isTag = (v: unknown): v is Tag => typeof v === 'string' && TAG_RE.test(v);
/** An operation or item id (a uuid made on the device when the player confirmed): the chat's id shape. */
export const isOpId = (v: unknown): v is string => typeof v === 'string' && OP_RE.test(v);
export const isHubId = (v: unknown): v is HubId => HUBS.includes(v as string);
/** The tag as a friend code: `7F3A-91C2-0B4E-55D1`. */
export function friendCode(tag: Tag): FriendCode { return (tag.toUpperCase().match(/.{4}/g) ?? []).join('-'); }
/** A typed friend code (any case, dashes or spaces anywhere) → the tag, or null. */
export function tagOfCode(code: unknown): Tag | null {
  if (typeof code !== 'string' || code.length > 40) return null;
  const t = code.replace(/[\s-]/g, '').toLowerCase();
  return isTag(t) ? t : null;
}
/**
 * Short words a player typed (a note, a place's name): cleaned like chat text (controls become spaces, direction overrides removed, trimmed), at most
 * `max` code points, never empty. Null otherwise.
 */
export function shortText(v: unknown, max: number): string | null {
  if (typeof v !== 'string' || v.length > max * 4) return null;
  const c = cleanChatText(v);
  return c.ok && chatLength(c.text) <= max ? c.text : null;
}
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keysIn = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k));
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e14;
const coord = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 4096;

export function parsePlace(v: unknown): PlaceRef | null {
  if (!plain(v) || !keysIn(v, ['id', 'hub', 'name', 'icon']) || typeof v.id !== 'string' || !REF_RE.test(v.id) || !isHubId(v.hub)) return null;
  const name = shortText(v.name, PLACE_NAME_MAX); if (!name) return null;
  if (v.icon !== undefined && (typeof v.icon !== 'string' || v.icon.length > 16 || shortText(v.icon, 8) !== v.icon)) return null;
  return { id: v.id, hub: v.hub, name, ...(v.icon !== undefined ? { icon: v.icon as string } : {}) };
}
export function parsePerms(v: unknown): GuestPerms | null {
  return plain(v) && keysIn(v, ['use']) && typeof v.use === 'boolean' ? { use: v.use } : null;
}
export function parseHomeRef(v: unknown): HomeRef | null {
  if (!plain(v) || !keysIn(v, ['spec', 'hub', 'door', 'name']) || typeof v.spec !== 'string' || !SPEC_RE.test(v.spec) || !isHubId(v.hub)) return null;
  if (typeof v.door !== 'string' || !REF_RE.test(v.door)) return null;
  const name = shortText(v.name, NOTE_MAX); if (!name) return null;
  return { spec: v.spec, hub: v.hub, door: v.door, name };
}
/** A furniture placement as the home lane writes it (src/economy/placement.ts): null (stored), a small flat object of numbers/words/booleans, or up to four numbers. */
function placementShape(v: unknown): boolean {
  if (v === null) return true;
  if (Array.isArray(v)) return v.length <= 4 && v.every(x => typeof x === 'number' && Number.isFinite(x));
  if (!plain(v)) return false;
  const e = Object.entries(v);
  return e.length <= 8 && e.every(([k, x]) => /^[A-Za-z]{1,12}$/.test(k) && ((typeof x === 'number' && Number.isFinite(x)) || typeof x === 'boolean' || (typeof x === 'string' && x.length <= 40)));
}
/** A home snapshot (shape and size only: its meaning is the home lane's). At most SNAPSHOT_MAX characters as JSON. */
export function parseSnapshot(v: unknown): HomeSnapshot | null {
  if (!plain(v) || !keysIn(v, ['home', 'upgrades', 'furniture', 'at']) || !time(v.at)) return null;
  const home = parseHomeRef(v.home); if (!home) return null;
  if (!Array.isArray(v.upgrades) || v.upgrades.length > 32 || !v.upgrades.every(u => typeof u === 'string' && SPEC_RE.test(u))) return null;
  if (!Array.isArray(v.furniture) || v.furniture.length > 300) return null;
  const furniture: HomeSnapshot['furniture'] = [];
  for (const f of v.furniture) {
    if (!plain(f) || !keysIn(f, ['spec', 'at']) || typeof f.spec !== 'string' || !SPEC_RE.test(f.spec) || !placementShape(f.at ?? null)) return null;
    furniture.push({ spec: f.spec, at: f.at ?? null });
  }
  const out: HomeSnapshot = { home, upgrades: [...v.upgrades as string[]], furniture, at: v.at };
  return JSON.stringify(out).length <= SNAPSHOT_MAX ? out : null;
}

type Parsed = { ok: true; msg: ClientMessage } | { ok: false; id?: string; reason: 'invalid' | 'too-large' };
/** The fields each request may carry (all others make it 'invalid'). */
const FIELDS: Record<ClientMessage['type'], readonly string[]> = {
  conv: ['with', 'before'], read: ['with'], say: ['id', 'to', 'text'], loc: ['id', 'to', 'hub', 'x', 'z', 'name'],
  pay: ['id', 'to', 'amount', 'fund', 'note', 'req'], ask: ['id', 'to', 'amount', 'note'], 'ask-close': ['id', 'ref', 'how'],
  fund: ['id', 'amount'], cashout: ['id', 'amount'], history: ['before'],
  invite: ['id', 'to', 'snapshot', 'perms'], 'invite-answer': ['id', 'ref', 'accept'], 'invite-revoke': ['id', 'ref'], home: ['id', 'snapshot'],
  visit: ['id', 'host'], meet: ['id', 'to', 'place', 'when', 'note', 'counter'], 'meet-answer': ['id', 'ref', 'accept'], 'meet-cancel': ['id', 'ref'],
  'meet-here': ['id', 'ref'], block: ['id', 'tag', 'on'], report: ['id', 'tag', 'reason'], forget: ['id', 'with'], lookup: ['id', 'code'],
  where: ['hub', 'room'], find: ['id', 'tag'],
};
/**
 * A client's request, strictly shaped, or why not (with its id when it had a readable one, so the account can answer `ack.ok = false`). Text is cleaned
 * here (src/multiplayer/chatRules.ts rules): too long is 'too-large', empty is 'invalid'.
 */
export function parseClientMessage(v: unknown): Parsed {
  if (!plain(v) || typeof v.type !== 'string' || !Object.prototype.hasOwnProperty.call(FIELDS, v.type)) return { ok: false, reason: 'invalid' };
  const type = v.type as ClientMessage['type'], id = isOpId(v.id) ? v.id : undefined;
  const bad = (reason: 'invalid' | 'too-large' = 'invalid'): Parsed => ({ ok: false, ...(id ? { id } : {}), reason });
  if (!keysIn(v, ['type', ...FIELDS[type]])) return bad();
  if (FIELDS[type].includes('id') && !id) return bad();
  const note = v.note === undefined ? undefined : shortText(v.note, NOTE_MAX);
  if (note === null) return bad();
  const ref = (k: string) => isOpId(v[k]);
  switch (type) {
    case 'conv': return isTag(v.with) && (v.before === undefined || time(v.before)) ? { ok: true, msg: { type, with: v.with, ...(v.before !== undefined ? { before: v.before as number } : {}) } } : bad();
    case 'read': return isTag(v.with) ? { ok: true, msg: { type, with: v.with } } : bad();
    case 'say': {
      if (!isTag(v.to) || typeof v.text !== 'string') return bad();
      const t = shortText(v.text, 500);
      if (t) return { ok: true, msg: { type, id: id!, to: v.to, text: t } };
      const c = cleanChatText(v.text.slice(0, 20_000));
      return bad(!c.ok && c.reason === 'too-long' ? 'too-large' : 'invalid');
    }
    case 'loc': {
      const name = shortText(v.name, PLACE_NAME_MAX);
      return isTag(v.to) && isHubId(v.hub) && coord(v.x) && coord(v.z) && name ? { ok: true, msg: { type, id: id!, to: v.to, hub: v.hub, x: v.x, z: v.z, name } } : bad();
    }
    case 'pay':
      if (!isTag(v.to) || !whole(v.amount) || !whole(v.fund) || (v.req !== undefined && !ref('req'))) return bad();
      return { ok: true, msg: { type, id: id!, to: v.to, amount: v.amount, fund: v.fund, ...(note ? { note } : {}), ...(v.req !== undefined ? { req: v.req as string } : {}) } };
    case 'ask': return isTag(v.to) && whole(v.amount) ? { ok: true, msg: { type, id: id!, to: v.to, amount: v.amount, ...(note ? { note } : {}) } } : bad();
    case 'ask-close': return ref('ref') && (v.how === 'declined' || v.how === 'cancelled') ? { ok: true, msg: { type, id: id!, ref: v.ref as string, how: v.how } } : bad();
    case 'fund': case 'cashout': return whole(v.amount) ? { ok: true, msg: { type, id: id!, amount: v.amount } } : bad();
    case 'history': return v.before === undefined || time(v.before) ? { ok: true, msg: { type, ...(v.before !== undefined ? { before: v.before as number } : {}) } } : bad();
    case 'invite': {
      if (!isTag(v.to)) return bad();
      const snapshot = parseSnapshot(v.snapshot), perms = parsePerms(v.perms);
      if (!perms) return bad();
      if (!snapshot) return bad(JSON.stringify(v.snapshot ?? null).length > SNAPSHOT_MAX ? 'too-large' : 'invalid');
      return { ok: true, msg: { type, id: id!, to: v.to, snapshot, perms } };
    }
    case 'invite-answer': case 'meet-answer': return ref('ref') && typeof v.accept === 'boolean' ? { ok: true, msg: { type, id: id!, ref: v.ref as string, accept: v.accept } } : bad();
    case 'invite-revoke': case 'meet-cancel': case 'meet-here': return ref('ref') ? { ok: true, msg: { type, id: id!, ref: v.ref as string } } : bad();
    case 'home': {
      const snapshot = parseSnapshot(v.snapshot);
      return snapshot ? { ok: true, msg: { type, id: id!, snapshot } } : bad(JSON.stringify(v.snapshot ?? null).length > SNAPSHOT_MAX ? 'too-large' : 'invalid');
    }
    case 'visit': return isTag(v.host) ? { ok: true, msg: { type, id: id!, host: v.host } } : bad();
    case 'meet': {
      const place = parsePlace(v.place);
      if (!isTag(v.to) || !place || !time(v.when) || !Number.isInteger(v.when) || (v.counter !== undefined && !ref('counter'))) return bad();
      return { ok: true, msg: { type, id: id!, to: v.to, place, when: v.when as number, ...(note ? { note } : {}), ...(v.counter !== undefined ? { counter: v.counter as string } : {}) } };
    }
    case 'block': return isTag(v.tag) && typeof v.on === 'boolean' ? { ok: true, msg: { type, id: id!, tag: v.tag, on: v.on } } : bad();
    case 'report': return isTag(v.tag) && REPORTS.includes(v.reason as string) ? { ok: true, msg: { type, id: id!, tag: v.tag, reason: v.reason as 'insulte' } } : bad();
    case 'forget': return isTag(v.with) ? { ok: true, msg: { type, id: id!, with: v.with } } : bad();
    case 'lookup': return typeof v.code === 'string' && v.code.length <= 40 ? { ok: true, msg: { type, id: id!, code: v.code } } : bad();
    case 'where': return (v.hub === null || isHubId(v.hub)) && whole(v.room) && v.room >= 0 && v.room <= 128 ? { ok: true, msg: { type, hub: v.hub as HubId | null, room: v.room } } : bad();
    case 'find': return isTag(v.tag) ? { ok: true, msg: { type, id: id!, tag: v.tag } } : bad();
  }
}

const ITEM_KEYS: Record<Item['k'], readonly string[]> = {
  text: ['text'], loc: ['hub', 'x', 'z', 'name'], pay: ['amount', 'op', 'note', 'req'], ask: ['amount', 'note', 'state', 'paidBy'],
  invite: ['home', 'perms', 'state', 'until'], meet: ['place', 'when', 'state', 'counter', 'here', 'note'],
};
const ASK_STATES: readonly string[] = ['open', 'paid', 'declined', 'cancelled'];
const INVITE_STATES: readonly string[] = ['open', 'accepted', 'declined', 'revoked', 'expired'];
const MEET_STATES: readonly string[] = ['open', 'accepted', 'declined', 'countered', 'cancelled', 'met', 'missed'];
/** A conversation item, strictly shaped (an account's copy from another account, the device's cache, the server's frames). */
export function isItem(v: unknown): v is Item {
  if (!plain(v) || !isOpId(v.id) || !isTag(v.from) || !time(v.at) || typeof v.k !== 'string' || !Object.prototype.hasOwnProperty.call(ITEM_KEYS, v.k)) return false;
  const k = v.k as Item['k'];
  if (!keysIn(v, ['id', 'from', 'at', 'k', ...ITEM_KEYS[k]])) return false;
  const noteOk = v.note === undefined || shortText(v.note, NOTE_MAX) === v.note;
  switch (k) {
    case 'text': return typeof v.text === 'string' && shortText(v.text, 500) === v.text;
    case 'loc': return isHubId(v.hub) && coord(v.x) && coord(v.z) && typeof v.name === 'string' && shortText(v.name, PLACE_NAME_MAX) === v.name;
    case 'pay': return whole(v.amount) && v.amount > 0 && isOpId(v.op) && noteOk && (v.req === undefined || isOpId(v.req));
    case 'ask': return whole(v.amount) && v.amount > 0 && noteOk && ASK_STATES.includes(v.state as string) && (v.paidBy === undefined || isOpId(v.paidBy));
    case 'invite': return !!parseHomeRef(v.home) && !!parsePerms(v.perms) && INVITE_STATES.includes(v.state as string) && time(v.until);
    case 'meet': return !!parsePlace(v.place) && time(v.when) && MEET_STATES.includes(v.state as string) && (v.counter === undefined || isOpId(v.counter)) && noteOk
      && Array.isArray(v.here) && v.here.length <= 2 && v.here.every(isTag);
  }
}
const SEEN = (v: unknown) => v === 'online' || v === 'never' || time(v);
const TODAY = (v: unknown) => plain(v) && whole(v.funded) && whole(v.sent) && whole(v.received);
function isOp(v: unknown): v is LedgerOp {
  return plain(v) && isOpId(v.id) && (v.kind === 'fund' || v.kind === 'cashout' || v.kind === 'pay') && time(v.at) && whole(v.amount)
    && (v.from === undefined || isTag(v.from)) && (v.to === undefined || isTag(v.to)) && (v.fund === undefined || whole(v.fund))
    && (v.req === undefined || isOpId(v.req)) && (v.note === undefined || typeof v.note === 'string');
}
function isSummary(v: unknown): v is ConvSummary {
  return plain(v) && isTag(v.with) && typeof v.name === 'string' && whole(v.look) && (v.app === undefined || typeof v.app === 'string')
    && (v.last === null || isItem(v.last)) && whole(v.unread) && v.unread >= 0 && SEEN(v.seen) && typeof v.blocked === 'boolean';
}
/**
 * A frame from the account, or null when it is not one this client understands (it is then ignored: a newer server may add messages). Shapes are
 * checked as far as the client relies on them: items, money and the welcome strictly.
 */
export function parseServerMessage(v: unknown): ServerMessage | null {
  if (!plain(v) || typeof v.type !== 'string') return null;
  switch (v.type) {
    case 'welcome':
      return whole(v.v) && isTag(v.tag) && typeof v.code === 'string' && time(v.time) && whole(v.balance) && plain(v.limits) && TODAY(v.today)
        && Array.isArray(v.convs) && v.convs.every(isSummary) && Array.isArray(v.blocked) && v.blocked.every(isTag) ? v as unknown as ServerMessage : null;
    case 'conv': return isTag(v.with) && Array.isArray(v.items) && v.items.every(isItem) && typeof v.more === 'boolean' ? v as unknown as ServerMessage : null;
    case 'item': return isTag(v.with) && isItem(v.item) ? v as unknown as ServerMessage : null;
    case 'balance': return whole(v.balance) && TODAY(v.today) ? v as unknown as ServerMessage : null;
    case 'history': return Array.isArray(v.ops) && v.ops.every(isOp) && typeof v.more === 'boolean' ? v as unknown as ServerMessage : null;
    case 'seen': return isTag(v.tag) && SEEN(v.seen) ? v as unknown as ServerMessage : null;
    case 'visit': return isOpId(v.id) && typeof v.ok === 'boolean' && isTag(v.host) && (v.snapshot === undefined || !!parseSnapshot(v.snapshot)) ? v as unknown as ServerMessage : null;
    case 'visit-end': return isTag(v.host) && isOpId(v.invite) ? v as unknown as ServerMessage : null;
    case 'lookup': return isOpId(v.id) && (v.tag === null || isTag(v.tag)) ? v as unknown as ServerMessage : null;
    case 'find': return isOpId(v.id) && isTag(v.tag) && (v.hub === null || isHubId(v.hub)) && whole(v.room) ? v as unknown as ServerMessage : null;
    case 'ack': return isOpId(v.id) && typeof v.ok === 'boolean' && (v.item === undefined || isItem(v.item)) && (v.op === undefined || isOp(v.op)) ? v as unknown as ServerMessage : null;
    default: return null;
  }
}
