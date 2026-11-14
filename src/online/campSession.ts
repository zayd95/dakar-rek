import { CampClient, campRefusalText, type CampDeps } from './campClient';
import type { Outcome } from './api';
import type { Tag } from './protocol';
import { isMatchId, type CampListing, type CampTerms } from '../multiplayer/campProtocol';
import { CAMP_HUB, campInviteText, feeQuote, seatOf } from '../ui/phone/apps/campText';

/**
 * 1.0.1 Grand Camp: this device's one Grand Camp at a time (docs/release/GRAND-CAMP-RULES-1.0.1.md « one pending fee per player at a time »), shared
 * by the phone's screens (src/ui/phone/apps/camp.ts) and the match in the street (src/game/grandCamp.ts). One CampClient (src/online/campClient.ts):
 *
 * - `mine`: the match this player has a place in (organized or joined), kept on the device (`dakarrek.camp.match`) so that a reload opens its socket
 *   again AT ONCE, before the city has finished loading: the server gives the place back (before kick-off) or the pitch (after it, within 60 s).
 * - Looking at another match's lobby opens the same client on it, but only while the player has no place anywhere: a lobby left behind would lose its
 *   place (a closed socket before kick-off gives the fee back and frees the place after 60 s). With a place, another match shows its listing only.
 * - « Prêt »: the fee as the account can pay it — Teranga Money first, the wallet part brought in by the account's top-up (`deps.topUp`), checked
 *   here first so that a player who cannot cover it is told why without asking the server (never a negative balance; the server checks again).
 * - Invitations: the server's list (the organizer's `invite`: the invited player's Grand Camp list shows the match) and an ordinary text message in
 *   the conversation (campInviteText) — no new kind of Messages card, which a 1.0 client could not read.
 * Nothing here is shown as paid: the screens read `client.state.money`, which only says what the server answered.
 */
export interface CampSessionDeps {
  key: () => string | null;
  profile: () => { name: string; look: number; app?: string | null };
  /** `/api/camp` on the game's server (absent: the page's origin). */
  endpoint?: string;
  /** The account (src/online/api.ts `online`): Teranga Money's balance, today's top-up room, the wallet's top-up, a text message. */
  account: () => {
    status: string; balance: { amount: number } | null; limits: { fundDayMax: number } | null; today: { funded: number } | null;
    newId(): string; fund(o: { id: string; amount: number }): Promise<Outcome>; say(to: Tag, text: string): Outcome<{ id: string }>;
  } | null;
  wallet: () => number;
  storage?: () => Storage | null;
  WebSocketImpl?: typeof WebSocket; fetchImpl?: typeof fetch; now?: () => number;
}
const KEY = 'dakarrek.camp.match';

export class CampSession {
  private d: CampSessionDeps | null = null;
  private c: CampClient | null = null;
  /** The match this player has a place in (null: none); forgotten once its result was shown and closed (`done`). */
  mine: string | null = null;
  private listeners = new Set<() => void>();
  private offClient: (() => void) | null = null;

  /** Set once by main.ts; a build without the server never calls it (Grand Camp is then not offered). */
  configure(d: CampSessionDeps) { this.d = d; this.mine = this.stored(); }
  get enabled() { return !!this.d; }
  /** The client (made on first use), its state, its match. */
  get client(): CampClient | null {
    if (!this.d) return null;
    if (!this.c) {
      const d = this.d;
      const deps: CampDeps = {
        key: () => d.key() ?? '', profile: () => { const p = d.profile(); return { name: p.name, look: p.look, app: p.app ?? null }; },
        ...(d.endpoint ? { endpoint: d.endpoint } : {}),
        topUp: amount => { const a = d.account(); return a ? a.fund({ id: a.newId(), amount }) : Promise.resolve({ ok: false, reason: 'offline', text: campRefusalText('offline') }); },
        ...(d.WebSocketImpl ? { WebSocketImpl: d.WebSocketImpl } : {}), ...(d.fetchImpl ? { fetchImpl: d.fetchImpl } : {}), ...(d.now ? { now: d.now } : {}),
      };
      this.c = new CampClient(deps);
      this.offClient = this.c.onChange(() => this.follow());
    }
    return this.c;
  }
  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const fn of [...this.listeners]) { try { fn(); } catch { /* its own */ } } }

  /** At the start of the page: the match this player had a place in, opened again at once (the place or the pitch given back by the server). */
  restore(): boolean {
    const m = this.mine; const c = this.client;
    if (!m || !c) return false;
    void c.open(m);
    return true;
  }
  /** The lobbies of the Corniche that take players: the public ones and the private ones this player is invited to. */
  list(): Promise<Outcome<{ matches: CampListing[] }>> {
    const d = this.d;
    if (!d) return Promise.resolve({ ok: false, reason: 'solo', text: campRefusalText('solo') });
    return CampClient.list(CAMP_HUB, { key: () => d.key() ?? '', ...(d.endpoint ? { endpoint: d.endpoint } : {}), ...(d.fetchImpl ? { fetchImpl: d.fetchImpl } : {}) });
  }
  /** Opens a match's lobby on the screen: false while this player has a place in another one (its listing is all that is shown then). */
  view(match: string): boolean {
    const c = this.client;
    if (!c || !isMatchId(match)) return false;
    if (this.mine && this.mine !== match) return false;
    if (c.state.match !== match || c.state.status === 'closed' || c.state.status === 'idle') void c.open(match);
    return true;
  }
  /** The screen showing a lobby this player has no place in was left: its socket closes (a place, or the match being played, keeps it). */
  leaveView(match: string) {
    const c = this.c;
    if (!c || c.state.match !== match || this.mine === match) return;
    c.close();
  }
  async create(terms: CampTerms): Promise<Outcome<{ match: string }>> {
    const c = this.client;
    if (!c) return no('solo');
    if (this.mine) return no('busy');
    const r = await c.create(terms);
    if (r.ok) this.keep(r.match);
    return r;
  }
  async join(team?: 0 | 1): Promise<Outcome> {
    const c = this.client;
    if (!c?.state.match) return no('no-match');
    if (this.mine && this.mine !== c.state.match) return no('busy');
    const r = await c.join(team);
    if (r.ok) this.keep(c.state.match);
    return r;
  }
  /** How the fee would be paid now (Teranga Money first, then the wallet), or why it cannot be. */
  quote() {
    const fee = this.c?.state.lobby?.terms.fee ?? 0, a = this.d?.account() ?? null;
    const left = a?.limits && a.today ? Math.max(0, a.limits.fundDayMax - a.today.funded) : null;
    return feeQuote(fee, a && a.status === 'online' && a.balance ? a.balance.amount : fee > 0 ? null : 0, this.d?.wallet() ?? 0, left);
  }
  /** « Prêt »: refused here when the fee cannot be covered (told why), else asked of the server with the wallet part. */
  async ready(): Promise<Outcome> {
    const c = this.client;
    if (!c) return no('solo');
    const q = this.quote();
    if (q.why) return { ok: false, reason: 'insufficient', text: q.why };
    return c.ready(q.fromWallet > 0 ? { fund: q.fromWallet } : {});
  }
  async leave(): Promise<Outcome> {
    const c = this.client;
    if (!c) return no('solo');
    const r = await c.leave();
    if (r.ok && c.state.lobby?.state !== 'play') this.forget();
    return r;
  }
  /**
   * Invites players: the server's invitation list first (the invited player's Grand Camp list shows the match), then, for each, an ordinary text
   * message in the conversation. Returns how many messages went out (the server's answer decides the invitation itself).
   */
  async invite(tags: Tag[]): Promise<Outcome<{ said: number }>> {
    const c = this.client, l = c?.state.lobby;
    if (!c || !l) return no('no-match');
    const r = await c.invite(tags);
    if (!r.ok) return r;
    const a = this.d?.account(), text = campInviteText(l.terms, l.match);
    let said = 0;
    for (const t of tags) if (a?.say(t, text).ok) said++;
    return { ok: true, said };
  }
  /** The end was shown and closed (« Fermer » on the result): the match is forgotten on this device. */
  done() { if (this.c?.state.result || this.c?.state.lobby?.state === 'over' || this.c?.state.bye) { this.forget(); this.c?.close(); this.emit(); } }

  /** Why `tag` cannot be invited now (the street's player menu greys « Inviter au Grand Camp » with it), or null. */
  inviteWhy(tag: Tag): string | null {
    const c = this.c, l = c?.state.lobby;
    if (!this.mine || !c || !l || l.match !== this.mine) return 'Organise d’abord un Grand Camp (téléphone › Grand Camp)';
    if (l.org !== c.state.me) return 'Seul l’organisateur de ton match invite';
    if (l.state !== 'lobby') return 'Ton match a déjà commencé';
    if (l.players.some(p => p.tag === tag)) return 'Déjà dans ton match';
    if (c.state.status !== 'open') return 'Reconnexion…';
    return null;
  }

  /** My place, as the lobby has it. */
  seat() { const c = this.c; return c?.state.lobby ? seatOf(c.state.lobby, c.state.me) : null; }
  /** In the match being played now (on the roster, not gone). */
  playing(): boolean { const c = this.c, s = this.seat(); return !!c && c.state.lobby?.state === 'play' && !!s && !s.gone && c.state.match === this.mine; }

  /** After every change of the client: the place kept (or forgotten) on the device. */
  private follow() {
    const c = this.c!;
    const l = c.state.lobby, s = this.seat();
    if (c.state.bye === 'removed' && this.mine === c.state.match) this.forget();
    else if (l && s && !s.gone && l.state !== 'over') this.keep(l.match);
    else if (l && this.mine === l.match && c.state.status === 'open' && !s && l.state === 'lobby') this.forget();   // not a member any more (freed after a long drop)
    this.emit();
  }
  private keep(m: string) { if (this.mine === m) return; this.mine = m; try { (this.d?.storage?.() ?? localStorage).setItem(KEY, m); } catch { /* the session remembers */ } }
  private forget() { this.mine = null; try { (this.d?.storage?.() ?? localStorage).removeItem(KEY); } catch { /* gone anyway */ } }
  private stored(): string | null {
    try { const v = (this.d?.storage?.() ?? localStorage).getItem(KEY); return isMatchId(v) ? v : null; } catch { return null; }
  }
  /** Tests: a fresh session. */
  reset() { this.offClient?.(); this.c?.close(); this.c = null; this.d = null; this.mine = null; this.listeners.clear(); }
}
const no = (reason: string): { ok: false; reason: string; text: string } => ({ ok: false, reason, text: campRefusalText(reason) });

/** The device's Grand Camp (configured by main.ts in a build with the server). */
export const campSession = new CampSession();
/** What the world provides to the screens (src/game/grandCamp.ts): like phoneHooks, a feature shows only when its hook exists. */
export const campHooks: {
  /** At the Corniche's pitch now: « Prêt » needs it (no free teleport). */
  atPitch?: () => boolean;
  /** « Aller au terrain »: the marker and directions to the pitch (the phone closes). */
  goToPitch?: () => void;
  /** « Retour au terrain »: back to the match being played (the phone closes). */
  playNow?: () => void;
} = {};
