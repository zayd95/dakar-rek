/**
 * Text chat rules shared by the Worker (authoritative) and the client (early feedback).
 * Pure functions only: no DOM, no Workers APIs, so they run in vitest and in both runtimes.
 *
 * A chat message is text between players. It never carries, triggers or authorises a payment,
 * a transfer or any other economic action; nothing in the game parses chat text for commands.
 */
export const CHAT_MAX_CHARS = 200;
export const CHAT_NEAR_RADIUS = 30;
export const CHAT_RATE_COUNT = 5;
export const CHAT_RATE_WINDOW_MS = 10_000;
export const CHAT_DEDUPE_SIZE = 512;
export const REPORT_REASONS = ['insulte', 'harcelement', 'arnaque', 'autre'] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export type ChatChannel = 'near' | 'dm';
export type ChatFailure = 'invalid' | 'empty' | 'too-long' | 'rate-limited' | 'offline' | 'private-space' | 'no-position';

export interface ChatRequest { type: 'chat'; id: string; channel: ChatChannel; to?: string; text: string }
export interface ReportRequest { type: 'report'; target: string; reason: ReportReason }

const CONTROL = /[\p{Cc}\u2028\u2029]/gu;           // C0/C1 controls (newlines, tabs, escapes) and line separators
const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g; // direction overrides used to disguise text
/**
 * Cleans the text without rewriting it: control characters become spaces (words stay apart), direction
 * overrides are removed, the ends are trimmed. Spelling, language, case, emoji and inner spacing are kept.
 */
export function cleanChatText(value: unknown): { ok: true; text: string } | { ok: false; reason: ChatFailure } {
  if (typeof value !== 'string') return { ok: false, reason: 'invalid' };
  const text = value.normalize('NFC').replace(CONTROL, ' ').replace(BIDI, '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (chatLength(text) > CHAT_MAX_CHARS) return { ok: false, reason: 'too-long' };
  return { ok: true, text };
}
/** Length in user-visible code points (an emoji counts once, not as two UTF-16 units). */
export function chatLength(text: string) { return [...text].length; }

const ID = /^[A-Za-z0-9-]{8,64}$/;
export function isMessageId(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }

/** Validates the envelope; the text itself goes through cleanChatText so the server can answer with a precise reason. */
export function parseChatRequest(value: unknown): { ok: true; request: ChatRequest } | { ok: false; id?: string; reason: ChatFailure } {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'invalid' };
  const v = value as Record<string, unknown>;
  if (v.type !== 'chat' || !isMessageId(v.id)) return { ok: false, reason: 'invalid' };
  const id = v.id;
  if (v.channel !== 'near' && v.channel !== 'dm') return { ok: false, id, reason: 'invalid' };
  if (v.channel === 'dm' && !isMessageId(v.to)) return { ok: false, id, reason: 'invalid' };
  const cleaned = cleanChatText(v.text);
  if (!cleaned.ok) return { ok: false, id, reason: cleaned.reason };
  return { ok: true, request: { type: 'chat', id, channel: v.channel, ...(v.channel === 'dm' ? { to: v.to as string } : {}), text: cleaned.text } };
}
export function parseReport(value: unknown): ReportRequest | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.type !== 'report' || !isMessageId(v.target) || !REPORT_REASONS.includes(v.reason as ReportReason)) return null;
  return { type: 'report', target: v.target, reason: v.reason as ReportReason };
}

/**
 * Sliding window per connection. Returns the kept timestamps (to store in the session) and whether this message fits.
 * Rejected attempts are not recorded, so waiting is enough to send again.
 */
export function rateLimit(times: readonly number[], now: number, count = CHAT_RATE_COUNT, windowMs = CHAT_RATE_WINDOW_MS): { allowed: boolean; times: number[] } {
  const recent = times.filter(t => now - t < windowMs && t <= now);
  if (recent.length >= count) return { allowed: false, times: recent };
  return { allowed: true, times: [...recent, now] };
}

/** Bounded insertion-ordered memory of delivered message ids: a resend after a reconnect is acknowledged but not delivered twice. */
export class DedupeMemory<T> {
  private seen = new Map<string, T>();
  constructor(private limit = CHAT_DEDUPE_SIZE) {}
  get(id: string) { return this.seen.get(id); }
  remember(id: string, value: T) {
    this.seen.delete(id); this.seen.set(id, value);
    while (this.seen.size > this.limit) this.seen.delete(this.seen.keys().next().value as string);
  }
  get size() { return this.seen.size; }
}

export interface Placed { id: string; x: number; z: number; space: string }
/** Spaces where nobody else can hear: the personal room and individual làmb scenes. */
export function isPrivateSpace(space: string) { return space === 'home' || space === 'scene'; }
/** Recipients of a proximity message: same room (caller), same shared space, within the radius on the ground plane. */
export function nearRecipients<P extends Placed>(sender: Placed, others: Iterable<P>, radius = CHAT_NEAR_RADIUS): P[] {
  if (isPrivateSpace(sender.space)) return [];
  const out: P[] = [];
  for (const p of others) if (p.id !== sender.id && p.space === sender.space && Math.hypot(p.x - sender.x, p.z - sender.z) <= radius) out.push(p);
  return out;
}

/** Text shown in a bubble above a character: at most `max` code points, the full message stays in the history. */
export function bubbleText(text: string, max = 60) {
  const chars = [...text]; return chars.length <= max ? text : chars.slice(0, max - 1).join('').trimEnd() + '…';
}

export const FAILURE_LABEL: Record<ChatFailure, string> = {
  invalid: 'message refusé', empty: 'message vide', 'too-long': `trop long (${CHAT_MAX_CHARS} caractères max.)`,
  'rate-limited': 'trop rapide, attends quelques secondes', offline: 'la personne n’est plus en ligne',
  'private-space': 'personne ne t’entend ici', 'no-position': 'connexion en cours, réessaie',
};
