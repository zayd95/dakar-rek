/**
 * A quiet screen (Habib, 12 Oct; docs/UI_V2_PLAN.md §0 C): « I can't follow the game because of too many pop-up
 * messages ». The rules, pure (tests/quiet.test.ts); src/ui/hud.ts shows what they decide.
 * - Spoken lines (« Le contrôleur : « Xaaral tuuti ! » », the announcer, the DJ…) become ONE subtitle line at the
 *   bottom, above the controls, with the speaker's name, replaced by the next one.
 * - A refusal (« Pas assez d'argent »), or the game's answer to what the player just did (a tap on the window, a choice
 *   in a sheet), is one line near the action button. It and the subtitle share one slot: one transient at most.
 * - Everything else (purchases, ledger lines, tips, arrivals) goes to the quiet log — the phone's Notifications, a badge
 *   on the phone button — and is never shown over the game.
 * - The middle of the screen (`centreZone`) is never covered by any of it.
 */

/** Where a message goes: the subtitle line, the line by the action button, or the quiet log. */
export type Route = 'say' | 'now' | 'log';
export type MessageKind = 'info' | 'warn';

/** A message that comes this soon after the player acted (the button, E, a sheet's row) is the answer to it. */
export const ANSWER_MS = 900;

const SPEECH_ICON = /^(🎤|💬|🗣️|📣|📢)\s*/u;
/**
 * « Speaker : « … » » or « 🎤 Speaker : … »: who speaks (a name or a role, at most 40 characters), the colon (French
 * spacing: a space or a no-break space before it, src/i18n/lines.ts typo), then the words.
 */
const SPEECH = /^([^:«»\n]{2,40}?)([ \u00a0\u202f]:[ \u00a0]+)([\s\S]+)$/u;
/** People whose words come without quotes (their Wolof first, then the French: the coach's drills, a goodbye). */
const SPEAKERS = /^(Coach Ablaye|DJ Mbaye|Imam Seck|Ton voisin|Lamine|Saliou|Coumba)$/u;

/** The speaker and the words of a spoken line, else null (a plain notice: « Nouveau palier : … »). */
export function speechOf(msg: string): { icon: string; who: string; sep: string; line: string } | null {
  const i = SPEECH_ICON.exec(msg), rest = i ? msg.slice(i[0].length) : msg;
  const m = SPEECH.exec(rest);
  if (!m) return null;
  const who = m[1].trim(), line = m[3].trim();
  // a quoted line is speech; after the microphone (the announcer, the griot) any line is; and these people's words
  if (!i && !line.startsWith('«') && !SPEAKERS.test(who)) return null;
  return { icon: i ? i[1] : '', who, sep: m[2], line };
}

/** Where a message goes (`sinceAct`: milliseconds since the player last acted). */
export function route(msg: string, kind: MessageKind, sinceAct: number): Route {
  if (speechOf(msg)) return 'say';
  if (kind === 'warn' || sinceAct <= ANSWER_MS) return 'now';
  return 'log';
}

/** How long a line stays: time to read it (about 22 characters a second), 2.6 s to 7 s. */
export const lineMs = (msg: string) => Math.round(Math.min(7000, Math.max(2600, 1400 + msg.length * 45)));

export interface Rect { left: number; top: number; right: number; bottom: number }
/**
 * The middle of the screen, where the player, the ring or the stage is: the centred 40 % of the width, the middle
 * third of the height (33 %–62 %, a little higher than the centre: the third-person camera puts the player there).
 */
export function centreZone(w: number, h: number): Rect {
  return { left: Math.round(w * 0.3), right: Math.round(w * 0.7), top: Math.round(h * 0.33), bottom: Math.round(h * 0.62) };
}
/** Whether two rectangles overlap (touching edges do not). */
export const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** One entry of the quiet log (the phone's Notifications). */
export interface LogEntry { at: number; text: string; kind: MessageKind }
/**
 * The quiet log: the last 60 messages, newest first, and how many the player has not seen yet (the badge on the phone
 * button). The phone's Notifications marks them seen.
 */
export class QuietLog {
  readonly max = 60;
  private list: LogEntry[] = [];
  private unseen = 0;
  private subs = new Set<() => void>();
  add(text: string, kind: MessageKind = 'info', at = Date.now()) {
    const top = this.list[0];
    if (top && top.text === text && at - top.at < 4000) top.at = at;          // the same notice again: one entry
    else { this.list.unshift({ at, text, kind }); this.list.length = Math.min(this.list.length, this.max); this.unseen = Math.min(this.max, this.unseen + 1); }
    this.emit();
  }
  get entries(): readonly LogEntry[] { return this.list; }
  get unread() { return this.unseen; }
  markRead() { if (this.unseen) { this.unseen = 0; this.emit(); } }
  clear() { this.list = []; this.unseen = 0; this.emit(); }
  /** Called on every change (the badge). Returns the unsubscribe. */
  on(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { for (const f of this.subs) f(); }
}
export const quietLog = new QuietLog();

/** « à l'instant », « il y a 3 min », « il y a 2 h » (the Notifications list). */
export function ago(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)} h`;
}
