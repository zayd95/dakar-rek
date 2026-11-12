import type { HubId } from '../core/types';
import type {
  ConvSummary, Francs, FriendCode, GuestPerms, HomeRef, HomeSnapshot, InviteItem, Item, LedgerOp, LocationItem, MeetItem, MoneyLimits, MoneyRefusal,
  PlaceRef, Tag,
} from './protocol';

/**
 * LD2.0-B: what the game's UI and world code use of the player's online account (docs/ld2/LD2_B_CONTRACT.md). One object, `online`, provided by the
 * account client (src/online/client.ts, lane S) and, for tests and the solo build, by a fake (src/online/fake.ts). The Messages app (lane M) and the
 * visits and meetups (lane H) only ever use this interface: never the socket, never the protocol directly.
 */
export type OnlineStatus = 'solo' | 'connecting' | 'online' | 'reconnecting' | 'offline';

/** A conversation item as this device shows it: the server's item, plus the state of one of ours still on its way. */
export type ItemView = Item & {
  /** Ours, not yet acknowledged (shown at once, resent with the same id after a reconnect) or refused (never resent by itself). */
  status?: 'sending' | 'failed';
  reason?: string;
};
/** What a request answers: done, or why not, in a sentence the UI can show as it is. */
export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; reason: string; text: string };

/** How a send of `amount` would be paid, for the confirmation sheet (nothing is reserved yet). */
export interface PayQuote {
  amount: Francs;
  /** From Teranga Money (the server's balance as last known). */
  fromOnline: Francs;
  /** From the wallet, brought into Teranga Money in the same operation. */
  fromWallet: Francs;
  /** Set when it cannot be sent: the reason, and the sentence to show. */
  refusal?: MoneyRefusal; text?: string;
}

export interface OnlineApi {
  readonly status: OnlineStatus;
  /** This player's public tag and friend code once the account has answered at least once (kept from the last session while offline). */
  readonly me: { tag: Tag; code: FriendCode } | null;
  /**
   * Teranga Money: the balance the server gave last, when, and whether it is live (`fresh`: the account is connected now). Null before the first answer.
   * The device never computes it.
   */
  readonly balance: { amount: Francs; at: number; fresh: boolean } | null;
  readonly limits: MoneyLimits | null;
  readonly today: { funded: Francs; sent: Francs; received: Francs } | null;

  /** Conversations, the most recent first. */
  convs(): ConvSummary[];
  /** The known items of a conversation, oldest first (the newest page; `more` loads older ones). */
  items(withTag: Tag): ItemView[];
  more(withTag: Tag): Promise<boolean>;
  /** Marks a conversation read (the list's unread count and the phone badge). */
  read(withTag: Tag): void;
  /** Unread items in all conversations (the phone's badge). */
  unread(): number;
  /** The other player's account: online now, last seen, or never opened Messages. Asks the server when it is not known yet. */
  seen(tag: Tag): 'online' | number | 'never' | null;

  /** A new operation id, made when a confirmation is shown (the same id is sent however many times the player taps). */
  newId(): string;
  say(to: Tag, text: string): Outcome<{ id: string }>;
  shareLocation(to: Tag): Outcome<{ id: string }>;

  payQuote(amount: Francs): PayQuote;
  /** Sends money (Teranga Money first, the rest from the wallet in the same operation). Resolves once the server has answered. */
  pay(o: { id: string; to: Tag; amount: Francs; note?: string; req?: string }): Promise<Outcome<{ op: LedgerOp }>>;
  ask(o: { id: string; to: Tag; amount: Francs; note?: string }): Promise<Outcome<{ item: Item }>>;
  closeAsk(o: { id: string; ref: string; how: 'declined' | 'cancelled' }): Promise<Outcome>;
  /** Wallet → Teranga Money. */
  fund(o: { id: string; amount: Francs }): Promise<Outcome<{ op: LedgerOp }>>;
  /** Teranga Money → wallet. */
  cashout(o: { id: string; amount: Francs }): Promise<Outcome<{ op: LedgerOp }>>;
  history(before?: number): Promise<Outcome<{ ops: LedgerOp[]; more: boolean }>>;

  /** Invites `to` into the home the player lives in (its snapshot from `onlineHooks.homeSnapshot`). */
  invite(o: { id: string; to: Tag; perms: GuestPerms }): Promise<Outcome<{ item: InviteItem }>>;
  answerInvite(o: { id: string; ref: string; accept: boolean }): Promise<Outcome>;
  revokeInvite(o: { id: string; ref: string }): Promise<Outcome>;
  /** A guest at the host's door: the host's home as the host has it, if an accepted invitation allows it now. */
  visit(host: Tag): Promise<Outcome<{ snapshot: HomeSnapshot; perms: GuestPerms; invite: string }>>;

  meet(o: { id: string; to: Tag; place: PlaceRef; when: number; note?: string; counter?: string }): Promise<Outcome<{ item: MeetItem }>>;
  answerMeet(o: { id: string; ref: string; accept: boolean }): Promise<Outcome>;
  cancelMeet(o: { id: string; ref: string }): Promise<Outcome>;
  /** This player has arrived at an accepted meeting's place, in its window (sent once per meeting). */
  here(ref: string): void;

  block(tag: Tag, on: boolean): Promise<Outcome>;
  isBlocked(tag: Tag): boolean;
  report(tag: Tag, reason: 'insulte' | 'harcelement' | 'arnaque' | 'autre'): Promise<Outcome>;
  forget(withTag: Tag): Promise<Outcome>;
  lookup(code: FriendCode): Promise<Outcome<{ tag: Tag; name: string; look: number; app?: string }>>;
  /** Where a player is (district and presence room), when a meeting or a visit between you is accepted. */
  find(tag: Tag): Promise<Outcome<{ hub: HubId | null; room: number }>>;

  /** Called on every change (status, balance, conversations, items). Returns the unsubscribe. */
  onChange(fn: () => void): () => void;
  /** A host ended a visit this player is on (revoked, blocked): the home lane takes the guest out. */
  onVisitEnd(fn: (host: Tag, invite: string) => void): () => void;
}

/** The account in this build, or null (a build without the server keeps playing solo; the Messages app then says so). */
export let online: OnlineApi | null = null;
export function setOnline(api: OnlineApi | null) { online = api; }

/**
 * What the world provides to the online features (lane H: src/online/visit.ts, src/online/meetups.ts). Like phoneHooks: a feature appears only when its
 * hook exists, and these never touch the network.
 */
export const onlineHooks: {
  /** The home the player lives in and can invite into now, or null (no home). */
  homeToInvite?: () => HomeRef | null;
  /** That home as it is now, for the guest's client to draw. */
  homeSnapshot?: () => HomeSnapshot | null;
  /** Where the player is, for « Partager ma position »: district, point and the nearest named place. */
  hereNow?: () => Omit<LocationItem, 'id' | 'from' | 'at' | 'k'> | null;
  /** The existing destinations a meeting can be set at (the Corniche pitch, the arena, a restaurant…), and « Chez moi » when there is a home. */
  meetupPlaces?: () => PlaceRef[];
  /** « Y aller »: guides the player to a place, a shared location, or the host's door of an accepted invitation. */
  goToPlace?: (place: PlaceRef) => void;
  goToLocation?: (loc: LocationItem) => void;
  goToInvite?: (host: Tag, invite: InviteItem) => void;
  /** The host whose home the player is visiting now, or null. */
  visiting?: () => Tag | null;
} = {};
