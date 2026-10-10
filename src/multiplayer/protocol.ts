import { HUB_IDS, type HubId } from '../core/types';
import type { ChatChannel, ChatFailure } from './chatRules';

export const PROTOCOL_VERSION = 1;
export const ROOM_CAPACITY = 24;
export const MAX_ROOMS_PER_HUB = 128;
export const SEND_INTERVAL_MS = 200;
/** Poses a player may show to others (a narrow list: anything else closes the socket). Lie, SitFloor and Ride are the
 * kit's held poses (a bed, a mat or cushion, a motorbike: src/actors/humanoid.ts POSES). */
export const PRESENCE_CLIPS = ['Idle', 'Walk', 'Run', 'Talk', 'Sit', 'Stance', 'Dance_A', 'Dance_B', 'Celebrate', 'Prep', 'Entrance_Walk', 'Kneel', 'Lie', 'SitFloor', 'Ride'] as const;
export type PresenceClip = typeof PRESENCE_CLIPS[number];
export interface Move {
  type: 'move'; x: number; y: number; z: number; yaw: number; speed: number;
  space: string; clip: PresenceClip;
  /** Where this player's arena evening is (optional; src/arena/together.ts). */
  arena?: ArenaPresence;
}
/** The arena show's phases, in order (src/arena/program.ts ShowPhase), as sent in `arena.p`. */
export const ARENA_PHASES = ['idle', 'filling', 'entrance', 'bout', 'result', 'leaving', 'over'] as const;
/** How a bout ended (src/lamb/duel.ts outcomes), as sent in `arena.o`. */
export const ARENA_OUTCOMES = ['projection', 'decision', 'egalite', 'abandon'] as const;
/**
 * A player's arena evening, so that friends inside the arena watch one bout: the city day `d`, the show's phase `p`
 * (index in ARENA_PHASES) and its time `t` in seconds, and once known the result: `w` 0 = no winner, 1 = the left
 * wrestler, 2 = the right one; `o` the outcome (index in ARENA_OUTCOMES). Display only — no money, record or reward
 * depends on it; each client aligns itself (server-authoritative timing comes later).
 */
export interface ArenaPresence { d: number; p: number; t: number; w?: number; o?: number }
const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
/** The `arena` field, or null when it is malformed (the whole move is then refused). */
export function parseArena(value: unknown): ArenaPresence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['d', 'p', 't', 'w', 'o'].includes(k))) return null;
  if (!int(v.d, 1, 1_000_000) || !int(v.p, 0, ARENA_PHASES.length - 1) || typeof v.t !== 'number' || !Number.isFinite(v.t) || v.t < 0 || v.t > 900) return null;
  if (v.w !== undefined && !int(v.w, 0, 2)) return null;
  if (v.o !== undefined && !int(v.o, 0, ARENA_OUTCOMES.length - 1)) return null;
  return { d: v.d as number, p: v.p as number, t: Math.round((v.t as number) * 10) / 10, ...(v.w !== undefined ? { w: v.w as number } : {}), ...(v.o !== undefined ? { o: v.o as number } : {}) };
}
/** Optional fields gameplay modules add to the player's presence (GameModule.presence), each validated in parseMove. */
export type PresenceExtras = Pick<Move, 'arena'>;
/** `tag` is a stable public key derived server-side from a private device key: mute/block survive reconnects without revealing the key. */
export interface Peer extends Move { id: string; name: string; look: number; tag?: string; rec?: string; updatedAt: number }
export interface ChatMessage { type: 'chat'; id: string; from: string; name: string; tag?: string; channel: ChatChannel; text: string; at: number }
export interface ChatAck { type: 'chat-ack'; id: string; ok: boolean; reason?: ChatFailure; delivered?: number; duplicate?: boolean; at?: number }
export type ServerMessage =
  | { type: 'welcome'; version: number; id: string; hub: HubId; room: number; count: number; time: number; peers: Peer[] }
  | { type: 'peer'; peer: Peer }
  | { type: 'leave'; id: string; count: number }
  | { type: 'count'; count: number }
  | ChatMessage
  | ChatAck
  | { type: 'report-ack'; target: string; ok: boolean };

export function isHub(value: unknown): value is HubId { return HUB_IDS.includes(value as HubId); }
export function nickname(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Dakarois' : 'Dakarois';
}
/** Private per-device key (random hex) sent on connect; only its hash is ever shared. */
export function deviceKey(value: unknown): string | null { return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value) ? value : null; }
/** Rungs of the làmb ladder a public record may name (src/career/career.ts RUNGS labels; a test keeps them in step). */
export const REC_RUNGS = ['Petits combats', 'Undercards', 'Combats classés', 'Adversaires réputés', 'Contender', 'Champion', 'Roi des Arènes'] as const;
export const REC_MAX = 48;
/**
 * A player's public sporting record, shown to others under the name: « <rung> », optionally « · <wins>-<losses> »
 * (« -<draws> ») and « · Écurie <Name> », nothing else. Anything that does not fit this shape is refused (undefined).
 */
export function recordTag(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || value.length > REC_MAX) return undefined;
  const parts = value.normalize('NFC').split(' · ');
  if (parts.length > 3 || !(REC_RUNGS as readonly string[]).includes(parts[0])) return undefined;
  let i = 1;
  if (parts[i] !== undefined && /^\d{1,4}-\d{1,4}(?:-\d{1,4})?$/.test(parts[i])) i++;
  if (parts[i] !== undefined && /^Écurie \p{L}{2,16}$/u.test(parts[i])) i++;
  return i === parts.length ? parts.join(' · ') : undefined;
}
export function lookIndex(value: unknown): number {
  const n = Number(value); return Number.isInteger(n) && n >= 0 && n < 6 ? n : 0;
}
/** Presence accepts positions and poses only. Money, inventory and saves never cross this protocol. */
export function parseMove(value: unknown, hub: HubId): Move | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.type !== 'move' || !['x', 'y', 'z', 'yaw', 'speed'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))) return null;
  const x = v.x as number, y = v.y as number, z = v.z as number, speed = v.speed as number;
  if (Math.abs(x) > 4096 || Math.abs(z) > 4096 || y < -20 || y > 100 || speed < 0 || speed > 6) return null;
  // spaces: the street, the own room, a scene, a public interior of this hub, a vehicle of one of its lines
  // (src/transport) or a mosque's prayer hall (src/venues/mosque.ts)
  if (typeof v.space !== 'string' || !(v.space === 'street' || v.space === 'home' || v.space === 'scene'
    || new RegExp(`^${hub}:(?:(?:gargote|maiga):[0-9]{2}|rapide:[0-9a-z]{1,6}:[0-9])$`).test(v.space)
    || new RegExp(`^${hub}:venue:mosque:[0-9]{2}:salle$`).test(v.space))) return null;
  if (!PRESENCE_CLIPS.includes(v.clip as PresenceClip)) return null;
  const arena = v.arena === undefined ? undefined : parseArena(v.arena);
  if (arena === null) return null;
  return { type: 'move', x, y, z, speed, yaw: Math.atan2(Math.sin(v.yaw as number), Math.cos(v.yaw as number)), space: v.space, clip: v.clip as PresenceClip, ...(arena ? { arena } : {}) };
}
