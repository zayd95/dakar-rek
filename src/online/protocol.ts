import type { HubId } from '../core/types';

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
