import type { Target, TargetSource } from '../interact/types';
import { EMOTES, type EmoteKind, type EmotePresence, type Peer, type PresenceClip } from './protocol';
import { CHAT_NEAR_RADIUS, isPrivateSpace } from './chatRules';

/**
 * Lightweight social between real players (M1-C, C4), on the presence that exists: no new message, no friend list, no new
 * server. A player greets the one next to them with a fixed gesture (a glyph over the head and a short pose, shown to those
 * nearby), is told when someone greets them in particular, can see who else is close without anything added to the screen
 * but one quiet line, and sees that a bench seat is taken when a player sits on it. Blocking, reporting, the private rooms
 * and the proximity radius of the chat apply unchanged: a blocked player is neither drawn, nor greeted, nor greeting.
 */
export const EMOTE_INFO: Record<EmoteKind, { glyph: string; label: string; clip: PresenceClip; toast: string; you: string }> = {
  salut: { glyph: '👋', label: 'Saluer', clip: 'Talk', toast: 'te salue', you: 'Tu salues' },
  merci: { glyph: '🙏', label: 'Remercier', clip: 'Talk', toast: 'te remercie', you: 'Tu remercies' },
  bravo: { glyph: '👏', label: 'Applaudir', clip: 'Celebrate', toast: 't’applaudit', you: 'Tu applaudis' },
  rire: { glyph: '😄', label: 'Rire ensemble', clip: 'Talk', toast: 'rit avec toi', you: 'Tu ris avec' },
};
/** How close another player must be to be greeted (m): next to each other. */
export const GREET_REACH = 3.2;
/** At most one emote this often from one player, whoever the other is (ms), and the same limit on what is shown from one player. */
export const EMOTE_GAP_MS = 2500;
export const RECEIVE_GAP_MS = 1500;
/** How long the glyph and the gesture last (ms). */
export const EMOTE_SHOW_MS = 3000;
/** Players closer than this are noticed (m), at most one line every NOTICE_GAP_MS; the chat's own radius bounds what is shown at all. */
export const NOTICE_R = 14;
export const NOTICE_GAP_MS = 45_000;

/**
 * Records a peer's emote counter and says whether a NEW emote just appeared: the counter changed since this peer was last
 * seen. Never for the first sighting of a peer whose emote was already there (someone arriving does not replay an old greeting),
 * but a peer first seen without any emote who then makes one does count (their counter goes from 0 to 1).
 */
export function emoteChanged(seen: Map<string, number>, id: string, emo: EmotePresence | undefined): boolean {
  const n = emo?.n ?? 0, prev = seen.get(id);
  seen.set(id, n);
  return prev !== undefined && prev !== n && n !== 0;
}

/** This player's own emotes: the last one is part of their presence until they make another. */
export class Emoter {
  emo: EmotePresence | null = null;
  private n = 0; private at = -Infinity;
  /** Makes an emote now (`to`: the presence id it is meant for); false when it is too soon after the last. */
  make(kind: EmoteKind, to: string | undefined, now: number): boolean {
    if (now - this.at < EMOTE_GAP_MS) return false;
    this.at = now; this.n = (this.n % 999_999) + 1;
    this.emo = { k: kind, n: this.n, ...(to ? { to } : {}) };
    return true;
  }
  reset() { this.emo = null; }
}

/** The players next to you, as targets: « Saluer <name> » and the other gestures behind it. */
export class PlayerSocial implements TargetSource {
  readonly name = 'players';
  constructor(private peers: () => Iterable<Peer>, private hidden: (p: Peer) => boolean, private act: (kind: EmoteKind, peer: Peer) => void) {}
  collect(space: string, x: number, z: number, out: Target[]) {
    if (isPrivateSpace(space)) return;
    for (const p of this.peers()) {
      if (p.space !== space || Math.abs(p.x - x) > GREET_REACH || Math.abs(p.z - z) > GREET_REACH || this.hidden(p)) continue;
      out.push({
        id: 'peer:' + p.id, name: p.name, kind: 'person', space, x: p.x, z: p.z, y: 2.15, radius: GREET_REACH, bias: 1.3,   // a free seat next to a seated player (bias 1) is offered before the greeting: sitting together comes first
        affordances: () => EMOTES.map(k => ({ id: k, verb: 'greet' as const, label: EMOTE_INFO[k].label, icon: EMOTE_INFO[k].glyph, run: () => this.act(k, p) })),
      });
    }
  }
}

/** One quiet line when a real player comes close (« Dakarois 4F2A est près de toi »): each once, and not more than one per NOTICE_GAP_MS. */
export class Notice {
  private seen = new Set<string>(); private at = -Infinity;
  next(peers: Iterable<Peer>, me: { x: number; z: number; space: string }, hidden: (p: Peer) => boolean, now: number): Peer | null {
    if (isPrivateSpace(me.space) || now - this.at < NOTICE_GAP_MS) return null;
    let best: Peer | null = null, bd = NOTICE_R;
    for (const p of peers) {
      if (p.space !== me.space || this.seen.has(p.id) || hidden(p)) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d <= bd) { bd = d; best = p; }
    }
    if (best) { this.seen.add(best.id); this.at = now; }
    return best;
  }
  /** Peers that left are forgotten (a new player with the same id cannot exist: ids are fresh per connection). */
  reset() { this.seen.clear(); this.at = -Infinity; }
}

/** Poses that mean « sitting here »: the seat under them is taken. */
export const SEATED: readonly PresenceClip[] = ['Sit', 'SitFloor', 'Kneel'];
export const seatedPeers = (peers: Iterable<Peer>, space: string): Peer[] => [...peers].filter(p => p.space === space && SEATED.includes(p.clip));

/** Whether a gesture from `peer` should be shown here: in the same shared space, within the chat's radius, from a player not blocked. */
export function shownHere(peer: Pick<Peer, 'x' | 'z' | 'space'>, me: { x: number; z: number; space: string }): boolean {
  return peer.space === me.space && !isPrivateSpace(me.space) && Math.hypot(peer.x - me.x, peer.z - me.z) <= CHAT_NEAR_RADIUS;
}
